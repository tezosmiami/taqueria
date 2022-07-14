export const helpContentsJestPlugin = `taq <command>

Commands:
  taq init [projectDir]           Initialize a new project
  taq opt-in                      Opt-in to sharing anonymous usage analytics
  taq opt-out                     Opt-out of sharing anonymous usage analytics
  taq install <pluginName>        Install a plugin
  taq uninstall <pluginName>      Uninstall a plugin
  taq add-contract <sourceFile>   Add a contract to the contract registry
  taq rm-contract <contractName>  Remove a contract from the contract registry
  taq list-contracts              List registered contracts
  taq test [partition]            Setup a directory as a partition to run Jest t
                                  ests                           [aliases: jest]
  taq create <template>           Create files from pre-existing templates

Options:
      --version     Show version number                                [boolean]
      --build       Display build information about the current version[boolean]
  -p, --projectDir  Path to your project directory               [default: "./"]
  -e, --env         Specify an environment configuration
  -y, --yes         Select "yes" to any prompt        [boolean] [default: false]
      --help        Show help                                          [boolean]

Taqueria is currently in BETA. You've been warned. :)
`;

export const helpContentsJestPluginSpecific = `taq test [partition]

Setup a directory as a partition to run Jest tests

Positionals:
  partition  Name of the partition for these tests   [string] [default: "tests"]

Options:
      --version      Show version number                               [boolean]
      --build        Display build information about the current version
                                                                       [boolean]
  -p, --projectDir   Path to your project directory              [default: "./"]
  -e, --env          Specify an environment configuration
  -y, --yes          Select "yes" to any prompt       [boolean] [default: false]
      --help         Show help                                         [boolean]
  -i, --init         Initializes the partition for Jest                [boolean]
  -t, --testPattern  Run test files that match the provided pattern
`;
