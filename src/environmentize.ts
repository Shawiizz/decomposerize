import path from "path";
import { Configuration } from "./index";

export const environmentize = (config: Required<Configuration>, composeJson: any) => {
  if (config.environmentize) {
    // Helper to add -${ENV} before tags or at the end of name-like values
    const withEnvSuffix = (name: string | undefined): string | undefined => {
      if (!name) return name;
      if (name.includes("${ENV}")) return name;
      return `${name}-${"${ENV}"}`;
    };

    const withVersionTag = (image: string | undefined): string | undefined => {
      if (!image) return image;
      const [repo, tag] = String(image).split(":");
      const repoWithEnv = withEnvSuffix(repo) as string;
      return `${repoWithEnv}:${"${VERSION}"}`;
    };

    // Networks
    if (composeJson.networks) {
      const newNetworks: Record<string, any> = {};
      Object.entries(composeJson.networks).forEach(([netName, netConf]: [string, any]) => {
        const newName = withEnvSuffix(netName) as string;
        const newConf: any = { ...(netConf || {}) };
        if (newConf && typeof newConf === "object") {
          if (newConf.name) newConf.name = withEnvSuffix(newConf.name);
          // For external networks, do not change external true/false, but change the declared name in top-level key
        }
        newNetworks[newName] = newConf;
      });
      composeJson.networks = newNetworks;
    }

    // Volumes
    if (composeJson.volumes) {
      const newVolumes: Record<string, any> = {};
      Object.entries(composeJson.volumes).forEach(([volName, volConf]: [string, any]) => {
        const newName = withEnvSuffix(volName) as string;
        const newConf: any = { ...(volConf || {}) };
        if (newConf && typeof newConf === "object") {
          if (newConf.name) newConf.name = withEnvSuffix(newConf.name);
          if (newConf.external && typeof newConf.external === "object" && newConf.external.name) {
            newConf.external = { ...newConf.external, name: withEnvSuffix(newConf.external.name) };
          }
        }
        newVolumes[newName] = newConf;
      });
      composeJson.volumes = newVolumes;
    }

    // Precompute names that should get -${ENV} when referenced as hostnames
    const serviceRefNames = new Set<string>();
    Object.entries(composeJson.services || {}).forEach(([svcName, svc]: [string, any]) => {
      const service: any = svc;
      if (service.image) {
        const repo = String(service.image).split(":")[0];
        serviceRefNames.add(repo);
      }
      if (service.container_name) serviceRefNames.add(String(service.container_name));
      // Also add the service name itself
      serviceRefNames.add(svcName);
    });

    // Services: image, container_name, network references, volume references, env var hostnames
    Object.entries(composeJson.services || {}).forEach(([svcName, svc]: [string, any]) => {
      const service: any = svc;
      // Image
      if (service.image) {
        service.image = withVersionTag(service.image);
      } else if (service.build) {
        // If no image but build present, create a name from service name
        service.image = withVersionTag(`${svcName}`);
      }

      // Container name
      if (service.container_name) service.container_name = withEnvSuffix(service.container_name);

      // Environment variables: DB_HOST or *_HOST like values that match service names in compose
      if (service.environment && typeof service.environment === "object") {
        Object.keys(service.environment).forEach((envKey) => {
          const val = service.environment[envKey];
          if (typeof val === "string") {
            // Replace references that match service names, image repos, or container names
            if (serviceRefNames.has(val)) service.environment[envKey] = withEnvSuffix(val);
          }
        });
      }

      // Networks references
      if (service.networks) {
        if (Array.isArray(service.networks)) {
          service.networks = service.networks.map((n: any) => (typeof n === "string" ? withEnvSuffix(n) : n));
        } else if (typeof service.networks === "object") {
          const newServiceNetworks: Record<string, any> = {};
          Object.entries(service.networks).forEach(([key, value]: [string, any]) => {
            const newKey = withEnvSuffix(key) as string;
            newServiceNetworks[newKey] = value;
          });
          service.networks = newServiceNetworks;
        }
      }

      // Volumes references (mounts) where named volume appears at the start before ':'
      if (Array.isArray(service.volumes)) {
        service.volumes = service.volumes.map((entry: any) => {
          if (typeof entry === "string") {
            const parts = entry.split(":");
            if (parts.length > 1 && !path.isAbsolute(parts[0])) {
              parts[0] = withEnvSuffix(parts[0]) as string;
              return parts.join(":");
            }
            return entry;
          }
          if (typeof entry === "object" && entry.source && entry.type === "volume") {
            entry.source = withEnvSuffix(entry.source);
            return entry;
          }
          return entry;
        });
      }
    });
  }
};