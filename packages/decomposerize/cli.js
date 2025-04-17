#!/usr/bin/env node
/* eslint-disable */

const fs = require('fs');
const path = require('path');
const decomposerize = require('./dist/decomposerize');

const config = {
    dockerRunCommand: 'docker run',
    stopAndRemoveContainers: false,
    services: [],
    createVolumes: false,
    createNetworks: false,
    dockerRun: false,
    dockerRunRm: false,
    dockerRunDetach: false,
    multiline: false,
    'long-args': false,
    'arg-value-separator': ' ',
};

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: decomposerize [path_to_file] [options]');
    console.log('Options:');
    console.log('  --help, -h                  Displays this help message.');
    console.log(
        '  --docker-run                A boolean that, when true, adds the `docker run` command to the output. The default is false.',
    );
    console.log(
        "  --docker-run-command=<cmd>     A string that defines the Docker command to generate (e.g., 'docker run', 'docker create', 'docker container run'). It has a default value of 'docker run'.",
    );
    console.log(
        "  --docker-run-rm                A boolean that, when true, adds the '--rm' option to the command line arguments. The default is false.",
    );
    console.log(
        "  --docker-run-detach            A boolean that, when true, adds the '-d' option to the command line arguments. The default is false.",
    );
    console.log(
        '  --services=service1,service2          A list of services to include in the command line arguments. The default value is all services.',
    );
    console.log('  --stop-and-remove   Displays docker stop and docker rm command for your containers.');
    console.log('  --create-volumes    Displays `docker volume create` commands.');
    console.log('  --create-networks   Displays `docker network create` commands.');
    console.log(
        '  --multiline         A boolean that, when true, emits the command in multiline shell command format. The default value is false.',
    );
    console.log(
        "  --long-args         A boolean that, when true, emits long command line arguments (e.g., '--tty' instead of '-t'). The default value is false.",
    );
    console.log(
        "  --arg-value-separator=<sep>  A string representing the separator used between command arguments and their values. It can be either ' ' (space) or '='. The default value is ' ' (space).",
    );
    process.exit(0);
}

args.forEach((arg) => {
    if (arg.startsWith('--')) {
        const [option, value] = arg.substring(2).split('=');

        if (option === 'docker-run-command' && value) {
            config.dockerRunCommand = value;
        } else if (option === 'docker-run') {
            config.dockerRun = true;
        } else if (option === 'docker-run-rm') {
            config.dockerRunRm = true;
        } else if (option === 'docker-run-detach') {
            config.dockerRunDetach = true;
        } else if (option === 'stop-and-remove') {
            config.stopAndRemoveContainers = true;
        } else if (option === 'services') {
            config.services = value.split(',').map((service) => service.trim());
        } else if (option === 'create-volumes') {
            config.createVolumes = true;
        } else if (option === 'create-networks') {
            config.createNetworks = true;
        } else if (option === 'multiline') {
            config.multiline = true;
        } else if (option === 'long-args') {
            config['long-args'] = true;
        } else if (option === 'arg-value-separator' && value) {
            config['arg-value-separator'] = value;
        }
    }
});

if (args.length > 0 && !args[0].startsWith('--')) {
    const filePath = args[0];
    try {
        const composeFile = fs.readFileSync(path.resolve(filePath), 'utf8');
        console.log(decomposerize(composeFile, config));
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
} else {
    let composeFile = '';
    process.stdin
        .on('data', function (data) {
            composeFile += data;
        })
        .on('end', function () {
            console.log(decomposerize(composeFile, config));
        })
        .setEncoding('utf8');
}
