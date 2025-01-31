import {
	execCmd,
	getCurrentEnvironmentConfig,
	getInitialStorage,
	getSandboxConfig,
	sendAsyncErr,
	sendAsyncJsonRes,
	sendErr,
	sendJsonRes,
	stringToSHA256,
} from '@taqueria/node-sdk';
import type { Environment, LoadedConfig, RequestArgs, SandboxConfig } from '@taqueria/node-sdk/types';
import retry from 'async-retry';
import type { ExecException } from 'child_process';
import glob from 'fast-glob';
import { join } from 'path';

interface Opts extends RequestArgs.ProxyRequestArgs {
	sandboxName?: string;
	sourceFile?: string;
	sourceFiles?: string;
	storage?: string;
	input?: string;
	entrypoint?: string;
}

const isSandboxRunning = (sandboxName: string, opts: Opts) => {
	return getContainerName(sandboxName, opts)
		.then(containerName => execCmd(`docker ps --filter name=${containerName} | grep -w ${containerName}`))
		.then(_ => true)
		.catch(_ => false);
};

const getDefaultSandboxName = (config: LoadedConfig.t) => {
	const defaultEnv = config.environment?.default as string | undefined;
	if (defaultEnv) {
		const env = config.environment || {};
		const envConfig = env[defaultEnv] as Environment.t;
		const sandbox = envConfig.sandboxes[0];
		return sandbox;
	}
	return undefined;
};

const getUniqueSandboxname = async (sandboxName: string, projectDir: string) => {
	const hash = await stringToSHA256(projectDir);
	return `${sandboxName}-${hash}`;
};

const getContainerName = async (sandboxName: string, parsedArgs: Opts) => {
	const uniqueSandboxName = await getUniqueSandboxname(sandboxName, parsedArgs.projectDir);
	return `taqueria-${parsedArgs.env}-${uniqueSandboxName}`;
};

const doesUseFlextesa = (sandbox: SandboxConfig.t) => !sandbox.plugin || sandbox.plugin === 'flextesa';

const getInputFilenameFromContractDir = (opts: Opts, sourceFile: string) =>
	join('/project', opts.config.contractsDir, sourceFile);

const getInputFilenameFromArtifactsDir = (opts: Opts, sourceFile: string) =>
	join('/project', opts.config.artifactsDir, sourceFile);

const getCheckFileExistenceCommand = async (
	sandboxName: string,
	sandbox: SandboxConfig.t,
	sourcePath: string,
	opts: Opts,
) => `docker exec ${await getContainerName(sandboxName, opts)} ls ${sourcePath}`;

//////////// Typecheck task ////////////

const getTypecheckCommand = async (sandboxName: string, sandbox: SandboxConfig.t, sourcePath: string, opts: Opts) =>
	`docker exec ${await getContainerName(sandboxName, opts)} tezos-client typecheck script ${sourcePath}`;

const typecheckContract = (opts: Opts, sandboxName: string, sandbox: SandboxConfig.t) =>
	async (sourceFile: string): Promise<{ contract: string; result: string }> => {
		let sourcePath: string = getInputFilenameFromArtifactsDir(opts, sourceFile);
		sourcePath = await getCheckFileExistenceCommand(sandboxName, sandbox, sourcePath, opts)
			.then(execCmd)
			.then(() => sourcePath)
			.catch(() => getInputFilenameFromContractDir(opts, sourceFile));

		const typecheckContractHelper = () => {
			return getTypecheckCommand(sandboxName, sandbox, sourcePath, opts)
				.then(execCmd)
				.then(async ({ stderr }) => { // How should we output warnings?
					if (stderr.length > 0) sendErr(`\n${stderr}`);
					return {
						contract: sourceFile,
						result: 'Valid',
					};
				})
				.catch(err => {
					sendErr(' ');
					sendErr(err.message.split('\n').slice(1).join('\n'));
					return Promise.resolve({
						contract: sourceFile,
						result: 'Invalid',
					});
				});
		};

		return getCheckFileExistenceCommand(sandboxName, sandbox, sourcePath, opts)
			.then(execCmd)
			.then(typecheckContractHelper)
			.catch(err => {
				sendErr(' ');
				sendErr(sourceFile + ': Does not exist\n');
				return Promise.resolve({
					contract: sourceFile,
					result: 'N/A',
				});
			});
	};

const typecheckMultiple = (opts: Opts, sandboxName: string, sandbox: SandboxConfig.t) =>
	(sourceFiles: string[]): Promise<{ contract: string; result: string }[]> => {
		return Promise.all(sourceFiles.map(typecheckContract(opts, sandboxName, sandbox)));
	};

const typecheckAll = (
	opts: Opts,
	sandboxName: string,
	sandbox: SandboxConfig.t,
): Promise<{ contract: string; result: string }[]> => {
	// TODO: Fetch list of files from SDK
	return glob(['**/*.tz'], { cwd: opts.config.artifactsDir, absolute: false })
		.then(entriesFromArtifactsDir =>
			glob(['**/*.tz'], { cwd: opts.config.contractsDir, absolute: false })
				.then(entriesFromContractsDir =>
					[...new Set([...entriesFromArtifactsDir, ...entriesFromContractsDir])].map(
						typecheckContract(opts, sandboxName, sandbox),
					)
				)
		)
		.then(promises => Promise.all(promises));
};

const typecheck = <T>(parsedArgs: Opts, sandboxName: string, sandbox: SandboxConfig.t) => {
	const sourceFiles = (parsedArgs.sourceFiles as string).split(',');
	let p;
	if (parsedArgs.sourceFiles) {
		if (sourceFiles.length == 1) {
			p = typecheckContract(parsedArgs, sandboxName, sandbox)(parsedArgs.sourceFiles as string).then(data => [data]);
		} else p = typecheckMultiple(parsedArgs, sandboxName, sandbox)(sourceFiles);
	} else {
		p = typecheckAll(parsedArgs, sandboxName, sandbox)
			.then(results => {
				if (results.length === 0) sendErr('No contracts found to compile.');
				return results;
			});
	}
	return p.then(sendAsyncJsonRes);
};

const typecheckTask = async <T>(parsedArgs: Opts): Promise<void> => {
	const sandboxName = parsedArgs.sandboxName ?? getDefaultSandboxName(parsedArgs.config);
	if (sandboxName) {
		const sandbox = getSandboxConfig(parsedArgs)(sandboxName);
		if (sandbox) {
			if (doesUseFlextesa(sandbox)) {
				return await isSandboxRunning(sandboxName, parsedArgs)
					? typecheck(parsedArgs, sandboxName, sandbox)
					: sendAsyncErr(`The ${sandboxName} sandbox is not running.`);
			}
			return sendAsyncErr(`Cannot start ${sandboxName} as its configured to use the ${sandbox.plugin} plugin.`);
		}
		return sendAsyncErr(`There is no sandbox configuration with the name ${sandboxName}.`);
	} else return sendAsyncErr('No sandbox specified or found in your .taq/config.json file');
};

//////////// Simulate task ////////////

// This is needed mostly due to the fact that execCmd() wraps the command in double quotes
const preprocessString = (value: string): string => {
	// 1. if the string contains escaped double quotes, escape them further
	value = value.replace(/\\"/g, '\\\\\\"');

	// 2. if the string contains unescaped double quotes, escape them
	value = value.replace(/(?<!\\)"/g, '\\"');

	return value;
};

const getSimulateCommand = async (
	opts: Opts,
	sandboxName: string,
	sandbox: SandboxConfig.t,
	sourceFile: string,
	sourcePath: string,
) => {
	const containerName = await getContainerName(sandboxName, opts);
	const rawStorage = opts.storage ?? await getInitialStorage(opts, sourceFile);
	if (rawStorage === undefined) {
		throw new Error('Error: Please specify a non-empty storage value in the CLI or in the config file.');
	}

	const storage = typeof rawStorage === 'string' ? rawStorage : `${rawStorage}`;
	const input = opts.input && typeof opts.input === 'string' ? opts.input : `${opts.input}`;

	const processedStorage = preprocessString(storage);
	const processedInput = preprocessString(input);

	const entrypoint = opts.entrypoint ? `--entrypoint ${opts.entrypoint}` : '';

	const cmd =
		`docker exec ${containerName} tezos-client run script ${sourcePath} on storage \'${processedStorage}\' and input \'${processedInput}\' ${entrypoint}`;
	return cmd;
};

const trimTezosClientMenuIfPresent = (msg: string): string => {
	return msg.replace(/Usage:(.|\n)+/, '');
};

const simulateContract = (opts: Opts, sandboxName: string, sandbox: SandboxConfig.t) =>
	async (sourceFile: string): Promise<{ contract: string; result: string }> => {
		let sourcePath: string = getInputFilenameFromArtifactsDir(opts, sourceFile);
		sourcePath = await getCheckFileExistenceCommand(sandboxName, sandbox, sourcePath, opts)
			.then(execCmd)
			.then(() => sourcePath)
			.catch(err => {
				if (opts.debug) sendErr(err);
				return getInputFilenameFromContractDir(opts, sourceFile);
			});

		const simulateContractHelper = () => {
			try {
				return getSimulateCommand(opts, sandboxName, sandbox, sourceFile, sourcePath)
					.then(execCmd)
					.then(async ({ stdout, stderr }) => { // How should we output warnings?
						if (stderr.length > 0) sendErr(`\n${stderr}`);
						return {
							contract: sourceFile,
							result: stdout,
						};
					})
					.catch(err => {
						const msg: string = trimTezosClientMenuIfPresent(err.message);
						sendErr(msg.split('\n').slice(1).join('\n'));
						return Promise.resolve({
							contract: sourceFile,
							result: 'Invalid',
						});
					});
			} catch (err) {
				sendErr(' ');
				sendErr((err as Error).message);
				return Promise.resolve({
					contract: sourceFile,
					result: 'Bad input or storage value',
				});
			}
		};

		return getCheckFileExistenceCommand(sandboxName, sandbox, sourcePath, opts)
			.then(execCmd)
			.then(simulateContractHelper)
			.catch(err => {
				sendErr(' ');
				if (opts.debug) sendErr(err);
				sendErr(sourceFile + ': Does not exist\n');
				return Promise.resolve({
					contract: sourceFile,
					result: 'N/A',
				});
			});
	};

const simulate = <T>(parsedArgs: Opts, sandboxName: string, sandbox: SandboxConfig.t) => {
	if (parsedArgs.sourceFile) {
		return simulateContract(parsedArgs, sandboxName, sandbox)(parsedArgs.sourceFile as string)
			.then(data => [data])
			.then(sendAsyncJsonRes);
	}
	return sendAsyncErr(`Please specify a contract. E.g. taq simulate local <contractName> ...`);
};

const simulateTask = async <T>(parsedArgs: Opts): Promise<void> => {
	const sandboxName = parsedArgs.sandboxName ?? getDefaultSandboxName(parsedArgs.config);
	if (sandboxName) {
		const sandbox = getSandboxConfig(parsedArgs)(sandboxName);
		if (sandbox) {
			if (doesUseFlextesa(sandbox)) {
				return await isSandboxRunning(sandboxName, parsedArgs)
					? simulate(parsedArgs, sandboxName, sandbox)
					: sendAsyncErr(`The ${sandboxName} sandbox is not running.`);
			}
			return sendAsyncErr(`Cannot start ${sandboxName} as its configured to use the ${sandbox.plugin} plugin.`);
		}
		return sendAsyncErr(`There is no sandbox configuration with the name ${sandboxName}.`);
	} else return sendAsyncErr('No sandbox specified or found in your .taq/config.json file');
};

export const client = <T>(parsedArgs: Opts): Promise<void> => {
	switch (parsedArgs.task) {
		case 'typecheck':
			return typecheckTask(parsedArgs);
		case 'simulate':
			return simulateTask(parsedArgs);
		default:
			return sendAsyncErr(`${parsedArgs.task} is not an understood task by the Tezos-client plugin`);
	}
};

export default client;
