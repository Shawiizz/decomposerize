import { Configuration } from "../index";

export const initConfig = (configuration: Configuration) => {
  const defaultConfiguration: Required<Configuration> = {
    stopAndRemoveContainers: false,
    services: [],
    createVolumes: false,
    createNetworks: false,
    dockerBuild: false,
    dockerRun: false,
    dockerRunCommand: "docker run",
    dockerRunRm: false,
    dockerRunDetach: false,
    deleteImages: false,
    ansibleEnvVarsFormat: false,
    multiline: false,
    "long-args": false,
    "arg-value-separator": " ",
    environmentize: false
  } as Required<Configuration>;

  return Object.assign({}, defaultConfiguration, configuration) as Required<Configuration>;
};