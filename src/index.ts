import Composeverter from "composeverter";
import YAML from "yaml";
import { MAPPINGS } from "./mappings";
import { environmentize } from "./environmentize";
import { initConfig } from "./util/config";

const getObjectByPath = (path: string, obj: any): any =>
  path.split("/").reduce((o: any, k: string) => {
    if (k === ":first:") return o && Object.values(o)[0];
    return o && (o as any)[k];
  }, obj);

export type ArgValueSeparator = "=" | " ";

export interface Configuration {
  services?: string[];
  stopAndRemoveContainers?: boolean;
  createVolumes?: boolean;
  createNetworks?: boolean;
  dockerBuild?: boolean;
  dockerRun?: boolean;
  dockerRunCommand?: string;
  dockerRunRm?: boolean;
  dockerRunDetach?: boolean;
  deleteImages?: boolean;
  ansibleEnvVarsFormat?: boolean;
  multiline?: boolean;
  "long-args"?: boolean;
  "arg-value-separator"?: ArgValueSeparator;
  environmentize?: boolean;
  composerize?: boolean;
}

function transformEnvVarsToAnsibleFormat(command: string): string {
  return command.replace(/\$\{([^}]+)\}/g, (_, varName) => {
    return `{{ lookup('ansible.builtin.env', '${varName}') }}`;
  });
}

const decomposerize = (input: string, configuration: Configuration = {}): string => {
  const composeJson = Composeverter.yamlParse(Composeverter.migrateToCommonSpec(input));
  if (!composeJson || !composeJson.services) return "";

  if (typeof composeJson.services === "string") {
    return "# invalid Docker Compose";
  }

  const config = initConfig(configuration);

  // Remove services not in the list (empty list means all services will be included)
  if (config.services.length > 0) {
    const filteredServices: Record<string, any> = {};
    Object.entries(composeJson.services).forEach(([serviceName, serviceConfig]) => {
      if (config.services.includes(serviceName)) {
        (filteredServices as any)[serviceName] = serviceConfig as any;
      }
    });
    composeJson.services = filteredServices;
  }

  const stringify = (value: any): string => {
    const stringValue = String(value);
    if (stringValue.match(/[\s"]/)) {
      const escapedString = stringValue.replace("\"", "\\\"");
      return String(`"${escapedString}"`);
    }
    return stringValue;
  };

  const commands: string[] = [];

  // Apply environmentization to compose model if requested
  environmentize(config, composeJson);

  // If composerize mode, return the modified YAML
  if (config.composerize) {
    // Remove default name added by composeverter
    if (composeJson.name === "<your project name>") {
      delete composeJson.name;
    }
    let yamlOutput = YAML.stringify(composeJson, { lineWidth: 0, nullStr: "" });
    if (config.ansibleEnvVarsFormat) {
      yamlOutput = transformEnvVarsToAnsibleFormat(yamlOutput);
    }
    return yamlOutput;
  }

  const pushOptionAndNameToCommand = (commandOptions: string[], argumentNames: string, value: String | string) => {
    let argument = argumentNames;
    if (argumentNames.includes("/")) argument = argumentNames.split("/")[config["long-args"] ? 0 : 1];

    const dash = argument.length === 1 ? "-" : "--";
    if (value !== "" && value !== null)
      commandOptions.push(`${dash}${argument}${config["arg-value-separator"]}${value.toString()}`);
    else commandOptions.push(`${dash}${argument}`);
  };

  // Networks
  Object.entries(composeJson.networks || []).forEach(([networkName, network]: [string, any]) => {
    if (!config.createNetworks) return;
    const commandOptions: string[] = [];

    const pushOptionAndName = (argumentNames: string, value: String | string) =>
      pushOptionAndNameToCommand(commandOptions, argumentNames, value);

    if (network) {
      if (network.driver) pushOptionAndName("driver/d", network.driver);
      if (network.attachable === true) pushOptionAndName("attachable", "");
      if (network.enable_ipv6 === true) pushOptionAndName("ipv6", "");
      if (network.internal === true) pushOptionAndName("internal", "");
      if (network.ipam) {
        const { ipam } = network;
        if (ipam.driver) pushOptionAndName("driver/d", ipam.driver);
        Object.entries(ipam.options || []).forEach(([driverOptName, driverOptValue]) => {
          pushOptionAndName("opt/o", driverOptName ? `${driverOptName}=${driverOptValue}` : (driverOptValue as any));
        });
        (ipam.config || []).forEach((ipamConfig: any) => {
          if (ipamConfig.subnet) pushOptionAndName("subnet", ipamConfig.subnet);
          if (ipamConfig.ip_range) pushOptionAndName("ip-range", ipamConfig.ip_range);
          if (ipamConfig.gateway) pushOptionAndName("gateway", ipamConfig.gateway);
          Object.entries(ipamConfig.aux_addresses || []).forEach(([auxName, auxValue]) => {
            pushOptionAndName("aux-address", auxName ? `${auxName}=${auxValue}` : (auxValue as any));
          });
        });
      }

      Object.entries(network.driver_opts || []).forEach(([driverOptName, driverOptValue]) => {
        pushOptionAndName("opt/o", driverOptName ? `${driverOptName}=${driverOptValue}` : (driverOptValue as any));
      });
      Object.entries(network.labels || []).forEach(([labelName, labelValue]) => {
        pushOptionAndName("label", labelName ? `${labelName}=${labelValue}` : (labelValue as any));
      });
    }

    commandOptions.push((network?.name as string) || networkName);

    commands.push(`docker network create ${commandOptions.join(config.multiline ? " \\\n\t" : " ")}`.replace(/[ ]+/g, " "));
  });

  // Volumes
  Object.entries(composeJson.volumes || []).forEach(([volumeName, volume]: [string, any]) => {
    if (!config.createVolumes) return;
    const commandOptions: string[] = [];

    const pushOptionAndName = (argumentNames: string, value: String | string) =>
      pushOptionAndNameToCommand(commandOptions, argumentNames, value);

    if (volume) {
      if (volume.driver) pushOptionAndName("driver/d", volume.driver);
      Object.entries(volume.driver_opts || []).forEach(([driverOptName, driverOptValue]) => {
        pushOptionAndName("opt/o", driverOptName ? `${driverOptName}=${driverOptValue}` : (driverOptValue as any));
      });
      Object.entries(volume.labels || []).forEach(([labelName, labelValue]) => {
        pushOptionAndName("label", labelName ? `${labelName}=${labelValue}` : (labelValue as any));
      });
    }

    commandOptions.push((volume?.external?.name as string) || (volume?.name as string) || volumeName);

    commands.push(`docker volume create ${commandOptions.join(config.multiline ? " \\\n\t" : " ")}`.replace(/[ ]+/g, " "));
  });

  // Remove previous containers with same name
  Object.entries(composeJson.services || []).forEach(([serviceName, service]: [string, any]) => {
    if (!config.stopAndRemoveContainers) return;
    const imageRepository = String(service.image).split(":")[0];
    commands.push(`docker stop ${service.container_name || imageRepository}`.replace(/[ ]+/g, " "));
    commands.push(`docker rm ${service.container_name || imageRepository}`.replace(/[ ]+/g, " "));
  });

  // Remove images of the same repository
  Object.entries(composeJson.services || []).forEach(([, service]: [string, any]) => {
    if (!config.deleteImages) return;
    commands.push(`docker rmi $(docker images ${String(service.image).split(":")[0]} -q)`.replace(/[ ]+/g, " "));
  });

  // Docker build
  Object.entries(composeJson.services || []).forEach(([serviceName, service]: [string, any]) => {
    if (!config.dockerBuild || !(service?.build?.dockerfile)) return;
    const commandOptions: string[] = [];

    const pushOptionAndName = (argumentNames: string, value: String | string) =>
      pushOptionAndNameToCommand(commandOptions, argumentNames, value);

    if (service.build) {
      if (service.build.dockerfile) pushOptionAndName("f", service.build.dockerfile);

      pushOptionAndName("t", `"${service?.image || `${serviceName}:latest`}"`);

      commandOptions.push(service.build?.context || ".");
    }

    commands.push(`docker build ${commandOptions.join(config.multiline ? " \\\n\t" : " ")}`.replace(/[ ]+/g, " "));
  });

  Object.entries(composeJson.services).forEach(([, service]: [string, any]) => {
    if (!config.dockerRun) return;
    const commandOptions: string[] = [];

    const pushOptionAndName = (argumentNames: string, value: String | string) =>
      pushOptionAndNameToCommand(commandOptions, argumentNames, value);

    if (config.dockerRunRm === true) commandOptions.push("--rm");
    if (config.dockerRunDetach === true) commandOptions.push(config["long-args"] ? "--detach" : "-d");

    const networkMode = getObjectByPath("network_mode", service);
    const networks = getObjectByPath("networks", service);
    if (networkMode) pushOptionAndName("network/net", networkMode);
    else if (networks)
      Object.entries(networks).forEach(([networkOrIndex, networkConfOrName]) => {
        const network = typeof networkConfOrName === "string" ? String(networkConfOrName) : String(networkOrIndex);
        pushOptionAndName("network/net", String(network));
      });

    Object.keys(service).forEach((serviceOption) => {
      Object.entries(MAPPINGS).forEach(([argumentNames, mapping]) => {
        const { type, path } = mapping;

        if (!path.startsWith(`${serviceOption}/`) && path !== serviceOption) return;

        const pushOption = (value: String | string) => pushOptionAndName(argumentNames, value);

        const targetValue = getObjectByPath(path, service);
        if (type !== "Networks" && !targetValue) return;

        if (type === "Array" || type === "ArrayAutoRepair") {
          if (Array.isArray(targetValue)) {
            (targetValue as any[]).forEach((v) => {
              if (v === null) return;
              if (typeof v === "object") {
                if (type === "Array") return;

                Object.entries(v).forEach(([kk, vv]) => {
                  pushOption(vv !== null ? `${kk}=${stringify(vv)}` : (kk as any));
                });
              } else {
                const stringValue = String(stringify(v));
                if (type === "ArrayAutoRepair") {
                  if (!stringValue.includes("=")) {
                    pushOption(stringValue.replace(/:/, "="));
                    return;
                  }
                }
                pushOption(stringValue);
              }
            });
          } else if (typeof targetValue === "string") {
            pushOption(stringify(targetValue));
          } else if (targetValue && typeof targetValue === "object") {
            Object.entries(targetValue as Record<string, any>).forEach(([k, v]) => {
              pushOption(
                v !== null
                  ? `${k}=${config.ansibleEnvVarsFormat ? "\"" : ""}${stringify(v)}${config.ansibleEnvVarsFormat ? "\"" : ""}`
                  : (k as any)
              );
            });
          }
        }
        if (type === "Ulimits") {
          Object.entries(targetValue as Record<string, any>).forEach(([key, v]) => {
            const { soft, hard } = v as any;
            if (hard && soft) pushOption(String(`${key}=${soft}:${hard}`));
            else pushOption(String(`${key}=${(v as any)}`));
          });
        }
        if (type === "Switch") {
          if (targetValue && targetValue.toString() === "true") pushOption("");
        }
        if (type === "Value") {
          pushOption(stringify(targetValue));
        }
        if (type === "IntValue" || type === "FloatValue") {
          pushOption(String(targetValue));
        }
        if (type === "DeviceBlockIOConfigRate") {
          (targetValue as any[]).forEach((v) => {
            const { path: deviceIORatePath, rate } = v as any;
            pushOption(String(`${deviceIORatePath}:${rate}`));
          });
        }
        if (type === "DeviceBlockIOConfigWeight") {
          (targetValue as any[]).forEach((v) => {
            const { path: deviceIOWeightPath, weight } = v as any;
            pushOption(String(`${deviceIOWeightPath}:${weight}`));
          });
        }
        if (type === "MapArray") {
          (targetValue as any[]).forEach((v) => {
            if (typeof v !== "object") return;

            const mapValues: string[] = [];
            Object.entries(v).forEach(([key, vv]) => mapValues.push(`${key}=${stringify(vv)}`));
            pushOption(String(mapValues.join(",")));
          });
        }
        if (type === "Map") {
          const mapValues: string[] = [];
          Object.entries(targetValue as Record<string, any>).forEach(([key, vv]) =>
            mapValues.push(`${key}=${stringify(vv)}`)
          );
          pushOption(String(mapValues.join(",")));
        }
      });
    });

    commandOptions.push(service.image);

    // Set container name if not set (using image name by default)
    if (!commandOptions.find((opt) => opt.startsWith("--name"))) {
      commandOptions.unshift(`--name ${service.container_name || String(service.image).split(":")[0]}`);
    }

    if (service.command) commandOptions.push(service.command);

    commands.push(
      `${config.dockerRunCommand} ${commandOptions.join(config.multiline ? " \\\n\t" : " ")}`.replace(/[ ]+/g, " ")
    );
  });

  return config.ansibleEnvVarsFormat ? commands.map(transformEnvVarsToAnsibleFormat).join("\n") : commands.join("\n");
};

export default decomposerize;
