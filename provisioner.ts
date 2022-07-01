import * as i18n from '@taqueria/protocol/i18n';
import * as InstalledPlugin from '@taqueria/protocol/InstalledPlugin';
import * as PositionalArg from '@taqueria/protocol/PositionalArg';
import * as SanitizedArgs from '@taqueria/protocol/SanitizedArgs';
import * as TaqError from '@taqueria/protocol/TaqError';
import * as Task from '@taqueria/protocol/Task';
import { attemptP, chain, chainRej, FutureInstance as Future, map, mapRej, reject, resolve } from 'fluture';
import { camelCase } from 'https://deno.land/x/case@2.1.1/mod.ts';
import { pipe } from 'https://deno.land/x/fun@v1.0.0/fns.ts';
import { defaultTo, has } from 'rambda';
import { z } from 'zod';
import {
	EphemeralState,
	LoadedConfig,
	PluginInfo,
	SanitizedAbsPath,
} from './taqueria-protocol/taqueria-protocol-types.ts';
import { CLIConfig } from './taqueria-types.ts';
import * as utils from './taqueria-utils/taqueria-utils.ts';
// Get utils
const {
	joinPaths,
	writeTextFile,
	readTextFile,
	doesPathExist,
	taqResolve,
} = utils.inject({
	stdout: Deno.stdout,
	stderr: Deno.stderr,
});

const toInterfaceName = (value: string) =>
	pipe(
		value
			.replace('@', '')
			.replace('-', '_')
			.replace('/', '_')
			.replace(/\s+/, '_')
			.replace('__', '_'),
		camelCase,
	);

const toTasksInterface = (pluginName: string) =>
	(task: Task.t): [string, string, string] => {
		const interfaceName = toInterfaceName(`${pluginName}_${task.task}`);
		const positionals = task.positionals
			? task.positionals!.reduce(
				(retval, positional) => {
					const key = positional.required
						? positional.placeholder
						: `${positional.placeholder}?`;

					const defaultValue = positional.defaultValue !== undefined
						? (positional.type === 'string' ? `'${positional.defaultValue}'` : positional.defaultValue)
						: undefined;

					const value = defaultValue !== undefined
						? positional.type
						: `${defaultValue} | ${positional.type}`;

					return [...retval, `${key}: ${value}`];
				},
				[] as string[],
			)
			: [];
		const options = task.options
			? task.options!.reduce(
				(retval, option) => {
					const key = option.required
						? option.flag
						: `${option.flag}?`;

					const choices = option.choices
						? (
							option.type === 'string'
								? option.choices.map(val => `"${val}"`).join(' | ')
								: option.choices.join(' | ')
						)
						: option.type;

					const value = option.defaultValue !== undefined
						? `${option.defaultValue} | ${choices}`
						: option.type;

					return [...retval, `${key}: ${value}`];
				},
				[] as string[],
			)
			: [];

		return [
			task.task,
			interfaceName,
			`
	export interface ${interfaceName} {
	${positionals.join('\n')}
	${options.join('\n')}
	}
	`,
		];
	};

const toPluginInterface = (plugin: PluginInfo.t): [string, string, string, string] => {
	const tasks = plugin.tasks
		? plugin.tasks!.map(toTasksInterface(plugin.name))
		: [];

	const interfaceName = toInterfaceName(plugin.name);

	const output = [
		...tasks.map(([_, __, taskInterface]) => taskInterface),
		`export interface ${interfaceName} {`,
		...tasks.map(([taskName, taskInterfaceName, _]) => `${toInterfaceName(taskName)}: ${taskInterfaceName}`),
		'}',
	];

	return [
		plugin.alias,
		`'${plugin.name}'`,
		interfaceName,
		output.join('\n'),
	];
};

const toEnvInterface = (envName: string): [string, string, string] => [
	toInterfaceName(envName),
	`import ${envName}_state from "./${envName}-state.json" assert {type: "json"}`,
	`export type ${toInterfaceName(envName)} = typeof ${envName}_state`,
];

export const createProvisionerTypes = (config: LoadedConfig.t) =>
	(state: EphemeralState.t) => {
		const plugins = state.plugins.map(toPluginInterface);

		const configs = config.environment
			? Object.keys(config.environment).filter(key => key !== 'default').map(toEnvInterface)
			: [toEnvInterface('development')];

		const config_imports = configs.map(([_, configImport]) => configImport);

		const configInterfaces = configs.map(([_, __, configInterface]) => configInterface);

		const configInterfaceNames = configs.map(([configInterfaceName]) => configInterfaceName);

		const output = [
			config_imports.join('\n'),
			`
declare global {
${configInterfaces.join('\n')}

export type RawState = ${configInterfaceNames.join(' | ')}

export interface State {
raw: RawState
}

export type ID = string

export interface Provision {
readonly id: ID
after: ID[]
when: (fn: (state: State) => boolean) => Provision
task: (fn: (state: State) => unknown) => Provision
}

export function provision(id: ID): Provision
`,
			...plugins.map(([_, __, ___, pluginInterface]) => pluginInterface),
			`export interface Tasks {`,
			...plugins.map(([pluginAlias, pluginName, pluginInterfaceName, _]) => `
${pluginAlias}: ${pluginInterfaceName}
${pluginName}: ${pluginInterfaceName}
`),
			'}',
			'export const tasks: Tasks',
			`}`,
		];

		return pipe(
			output.join('\n'),
			writeTextFile(joinPaths(config.projectDir, '.taq', 'provisioner.d.ts')),
			map(_ => state),
		);
	};

export const getProvisionerAbspath = (projectAbsPath: SanitizedAbsPath.t) =>
	joinPaths(projectAbsPath, '.taq', 'provisioner.ts');

export const createProvisioner = (config: LoadedConfig.t) =>
	(state: EphemeralState.t) =>
		pipe(
			getProvisionerAbspath(config.projectDir),
			doesPathExist,
			chainRej(_ =>
				writeTextFile(getProvisionerAbspath(config.projectDir))(`/// <reference types="./provisioner.d.ts" />\n`)
			),
			map(_ => state),
		);

type ValidTaskName = string & { __kind: 'ValidTaskName' };

const getPluginsForTask = (taskName: string, state: EphemeralState.t) =>
	state.plugins
		.filter(plugin => plugin.tasks?.find(task => task.task === taskName))
		.reduce(
			(retval, plugin) => [
				...retval,
				plugin.name,
				plugin.alias,
			],
			[] as string[],
		)
		.join(', ');

const isKnownPlugin = (pluginName: string, state: EphemeralState.t) =>
	state.plugins.find(plugin => plugin.name === pluginName || plugin.alias === pluginName) !== undefined;

const isCompositeTask = (state: EphemeralState.t) =>
	(taskName: ValidTaskName): boolean => has('task', state.tasks[taskName]);

const isValidTaskName = (taskName: string, state: EphemeralState.t): boolean => has(taskName, state.tasks);

const validateTask = (taskName: string, state: EphemeralState.t): Future<TaqError.t, ValidTaskName> =>
	isValidTaskName(taskName, state)
		? resolve(taskName as ValidTaskName)
		: reject(TaqError.create({
			kind: 'E_INVALID_TASK',
			msg: `${taskName} is not aware of this task. Perhaps you need to install plugin first?`,
		}));

const getTask = (taskName: string, state: EphemeralState.t, plugin?: string): Future<TaqError.t, Task.t> =>
	pipe(
		validateTask(taskName, state),
		map(isCompositeTask(state)),
		chain(isComposite => {
			const pluginsProviding = getPluginsForTask(taskName, state);
			if (isComposite) {
				if (!plugin) {
					reject(TaqError.create({
						kind: 'E_INVALID_TASK',
						msg:
							`${taskName} is provided by more than one plugin. Please use --plugin to select the plugin to use. Options: ${pluginsProviding}`,
					}));
				} else if (plugin && !isKnownPlugin(plugin, state)) {
					reject(TaqError.create({
						kind: 'E_INVALID_TASK',
						msg:
							`${plugin} is not a plugin that provides the ${taskName} task. Did you mean one of these plugins? ${pluginsProviding}`,
					}));
				}
				const validPluginName = plugin as string;
				const foundPlugin = state.plugins.find(plugin =>
					plugin.name === validPluginName || plugin.alias === validPluginName
				);
				const task = foundPlugin!.tasks!.find(task => task.task === taskName);
				return resolve(task as Task.t);
			}

			const pluginProviding = state.tasks[taskName] as InstalledPlugin.t;
			const validPluginName = pluginProviding.name;
			const foundPlugin = state.plugins.find(plugin =>
				plugin.name === validPluginName || plugin.alias === validPluginName
			);
			const task = foundPlugin!.tasks!.find(task => task.task === taskName);
			return resolve(task as Task.t);
		}),
	);

const toZodMethod = (
	arg: { type: PositionalArg.t['type']; name: string; defaultValue?: unknown; choices?: unknown[]; required?: boolean },
) =>
	z.preprocess(
		val =>
			val === undefined && arg.defaultValue !== undefined
				? arg.defaultValue
				: val,
		pipe(
			(() => {
				if (arg.choices && Array.isArray(arg.choices) && arg.choices.length > 0) {
					if (arg.type === 'boolean') {
						return z.boolean();
					} else if (arg.type === 'number') {
						return z.number().refine(val => arg.choices!.includes(val), {
							message: `${arg.name} is restricted to the following values: ${arg.choices.join(', ')}`,
						});
					}
					return z.string().refine(val => arg.choices!.includes(val), {
						message: `${arg.name} is restricted to the following values: ${arg.choices.join(', ')}`,
					});
				}

				if (arg.type === 'boolean') {
					return z.boolean();
				} else if (arg.type === 'number') {
					return z.number();
				}
				return z.string();
			})(),
			m => arg.required ? m : m.optional(),
		),
	);

export const toYargsOptions = (state: EphemeralState.t, taskName?: string, pluginName?: string) =>
	(cliConfig: CLIConfig) => {
		if (taskName && isValidTaskName(taskName, state)) {
			const validTaskName = taskName;
			const isComposite = isCompositeTask(state)(taskName as ValidTaskName);
			if (isComposite) {
				cliConfig.option('plugin', {
					describe: 'Specify which plugin should be used when provisioning this task',
					required: true,
					type: 'boolean',
					choices: getPluginsForTask(validTaskName, state),
				});
			}

			const requestedPlugin = (() => {
				if (!isComposite || pluginName) {
					return (() => {
						if (pluginName) {
							return state.plugins.find(plugin => plugin.name === pluginName || plugin.alias === pluginName);
						}
						const providingPlugin = state.tasks[validTaskName] as InstalledPlugin.t;
						return state.plugins.find(plugin =>
							plugin.name === providingPlugin.name || plugin.alias === providingPlugin.name
						);
					})();
				}
				const providingPlugin = state.tasks[validTaskName] as InstalledPlugin.t;
				return state.plugins.find(plugin =>
					plugin.name === providingPlugin.name || plugin.alias === providingPlugin.name
				);
			})();

			const task = requestedPlugin?.tasks?.find(task => task.task === validTaskName);
			if (task) {
				if (task.positionals) {
					task.positionals.reduce(
						(retval, positional) =>
							retval.option(positional.placeholder, {
								describe: positional.description,
								required: positional.required,
								default: positional.defaultValue,
								type: positional.type,
							}),
						cliConfig,
					);
				}
				if (task.options) {
					task.options.reduce(
						(retval, option) =>
							retval.option(option.flag, {
								alias: option.shortFlag,
								describe: option.description,
								choices: option.choices,
								default: option.defaultValue,
								type: option.type,
							}),
						cliConfig,
					);
				}
			}
			return cliConfig;
		}
	};

const getSchemaForTask = (parsedArgs: SanitizedArgs.ProvisionTaskArgs) =>
	(state: EphemeralState.t) =>
		pipe(
			getTask(parsedArgs.task, state, parsedArgs.plugin),
			map(task => {
				const positionals = (task.positionals || [])
					.map(({ placeholder, type, required, defaultValue }) => ({
						name: placeholder,
						type,
						required,
						defaultValue,
						choices: [],
					}));

				const options = (task.options || [])
					.map(({ flag, type, choices, required, defaultValue }) => ({
						name: flag,
						type,
						required,
						defaultValue,
						choices,
					}));

				const schema = [...positionals, ...options].reduce(
					(retval, shape) => ({
						...retval,
						...Object.fromEntries([
							[shape.name, toZodMethod(shape)],
						]),
					}),
					{
						task: z.string().min(1),
						name: z.string().min(1).optional(),
					},
				);

				return z.object(schema);
			}),
		);

const provision = (provisionName: string) => {
	const id = provisionName;
	const task = (state: {}) => {
	};

	return {
		id,
		task,
	};
};

declare global {
	const tasks: Record<string, Record<string, (taskArgs: Record<string, unknown>) => void>>;
}

export const getProvisionersAbspath = (projectDir: SanitizedAbsPath.t) =>
	joinPaths(
		projectDir,
		'.taq',
		'provisioners.ts',
	);

export const getProvisionersImportUrl = (projectDir: SanitizedAbsPath.t) =>
	pipe(
		getProvisionerAbspath(projectDir),
		readTextFile,
		map(contents => `const provision = globalThis.provision\n${contents}`),
		map(btoa),
		map(b64 => `data:text/javascript;base64,${b64}`),
	);
type Provision = {} & { __kind: 'provision' };

export const newProvision = (parsedArgs: SanitizedArgs.ProvisionTaskArgs, state: EphemeralState.t, _i18n: i18n.t) =>
	pipe(
		getSchemaForTask(parsedArgs)(state),
		chain(schema => attemptP(() => schema.parseAsync(parsedArgs))),
		map(result => result as unknown as Provision),
		mapRej(previous =>
			TaqError.create({
				kind: 'E_INVALID_ARGS',
				msg: `Invalid arguments for this task`,
				context: parsedArgs,
				previous,
			})
		),
	);

export const addNewProvision = (parsedargs: SanitizedArgs.ProvisionTaskArgs, state: EphemeralState.t) => {
	// Define tasks global object
	globalThis.tasks = state.plugins.reduce(
		(retval, plugin) => {
			const pluginTasks = plugin.tasks?.reduce(
				(tasks, task) => ({
					...tasks,
					...Object.fromEntries([
						[task.task, (taskArgs: Record<string, unknown>) => {}],
					]),
				}),
				{},
			);
			return {
				...retval,
				...Object.entries([
					[plugin.name, pluginTasks],
					[plugin.alias, pluginTasks],
				]),
			};
		},
		{},
	);

	// 1) Create new provision
	// 2) Create globalThis.provision() method
	// 3) Dynamically import the provisioners.ts file
	// 4)
};
