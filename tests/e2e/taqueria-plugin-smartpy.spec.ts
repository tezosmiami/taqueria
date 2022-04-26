import {checkFolderExistsWithTimeout, generateTestProject} from "./utils/utils";
import fsPromises from "fs/promises"
import { exec as exec1 } from "child_process";
import path from "path";
import util from 'util'
const exec = util.promisify(exec1)
import * as contents from "./data/smartpy-contents"

const taqueriaProjectPath = 'e2e/auto-test-smartpy-plugin';

describe("E2E Testing for taqueria SmartPy plugin",  () => {
    beforeAll(async () => {
        await generateTestProject(taqueriaProjectPath, ["smartpy"]);
    })

    test('Verify that taqueria smartpy plugin can compile one contract under contracts folder', async () => {
        try {
            // 1. Copy contract from data folder to taqueria project folder
            await exec(`cp e2e/data/hello-tacos.py ${taqueriaProjectPath}/contracts`);

            // 2. Run taq compile ${contractName}
            const compileOutput = await exec(`taq compile`, {cwd: `./${taqueriaProjectPath}`})

            // 3. Verify that compiled michelson version has been generated
            await checkFolderExistsWithTimeout(`./${taqueriaProjectPath}/artifacts/HelloTacos_comp`, 25000);
            expect(compileOutput.stdout).toBe(contents.smartPyCompiledOutput)

        } catch(error) {
            throw new Error (`error: ${error}`);
        }
    });

    test('Verify that taqueria smartpy plugin can compile one contract using compile [sourceFile] command', async () => {
        try {
            // 1. Copy contract from data folder to taqueria project folder
            await exec(`cp e2e/data/hello-tacos.py ${taqueriaProjectPath}/contracts`);

            // 2. Run taq compile ${contractName}
            const compileOutput = await exec(`taq compile hello-tacos.py`, {cwd: `./${taqueriaProjectPath}`});

            // 3. Verify that compiled michelson version has been generated
            await checkFolderExistsWithTimeout(`./${taqueriaProjectPath}/artifacts/HelloTacos_comp`, 25000);
            expect(compileOutput.stdout).toBe(contents.smartPyCompiledOutput)

        } catch(error) {
            throw new Error (`error: ${error}`);
        }

    });

    test.only('Verify that taqueria smartpy plugin can compile multiple contracts under contracts folder', async () => {
        try {
            // 1. Copy two contracts from data folder to /contracts folder under taqueria project
            await exec(`cp e2e/data/hello-tacos.py ${taqueriaProjectPath}/contracts/`);
            await exec(`cp e2e/data/calculator.py ${taqueriaProjectPath}/contracts/`);

            // 2. Run taq compile ${contractName}
            const compileOutput = await exec(`taq compile`, {cwd: `./${taqueriaProjectPath}`});
            console.log(compileOutput)

            console.log(await exec(`ls -al artifacts/`))
            // 3. Verify that compiled michelson version for both contracts has been generated
            await checkFolderExistsWithTimeout(`./${taqueriaProjectPath}/artifacts/HelloTacos_comp`, 25000);
            await checkFolderExistsWithTimeout(`./${taqueriaProjectPath}/artifacts/Calculator_comp`, 25000);
            expect(compileOutput.stdout).toBe(contents.compileMultipleContracts)


        } catch(error) {
            throw new Error (`error: ${error}`);
        }

    });

    test('Verify that taqueria smartpy plugin cannot compile an invalid contract under contracts folder', async () => {
        try {
            // 1. Copy contract from data folder to /contracts folder under taqueria project
            await exec(`cp e2e/data/calculator-invalid.py ${taqueriaProjectPath}/contracts/`);

            // 2. Run taq compile ${contractName}
            const compileOutput = await exec(`taq compile`, {cwd: `./${taqueriaProjectPath}`});

            // 3. Verify that compiled michelson version for both contracts has been generated
            await checkFolderExistsWithTimeout(`./${taqueriaProjectPath}/artifacts/Calculator_comp`, 25000);
            expect(compileOutput.stdout).toBe(contents.compileMultipleContracts)


        } catch(error) {
            throw new Error (`error: ${error}`);
        }

    });

    test('Verify that taqueria smartpy plugin handles no contracts correctly', async () => {
        try {
            // 1. Run taq compile
            const {stdout, stderr} = await exec(`taq compile`, {cwd: `./${taqueriaProjectPath}`});

            expect(stderr).toBe(contents.smartPyNothingCompiled)

        } catch(error) {
            throw new Error (`error: ${error}`);
        }
    });

    // // Remove all files from artifacts folder without removing folder itself
    // afterEach(async () => {
    //     try {
    //         const contractFiles = await fsPromises.readdir(`${taqueriaProjectPath}/contracts/`);
    //         for (const file of contractFiles) {
    //             await fsPromises.rm(path.join(`${taqueriaProjectPath}/contracts/`, file), {recursive: true});
    //         }

    //         const artifactFiles = await fsPromises.readdir(`${taqueriaProjectPath}/artifacts/`);
    //         for (const file of artifactFiles) {
    //             await fsPromises.rm(path.join(`${taqueriaProjectPath}/artifacts/`, file), {recursive: true});
    //         }
    //     } catch(error){
    //         throw new Error (`error: ${error}`);
    //     }
    // })

    // // Clean up process to remove taquified project folder
    // // Comment if need to debug
    // afterAll( async() => {
    //     try {
    //         await fsPromises.rm(taqueriaProjectPath, { recursive: true })
    //     } catch(error){
    //         throw new Error (`error: ${error}`);
    //     }
    // })
})