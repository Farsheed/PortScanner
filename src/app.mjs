import net from 'net';
import chalk from 'chalk';
import readline from 'readline';
import util from 'util';
import fs from 'fs';
import ora from 'ora';
import csv from 'csv-parser';

let openPorts = [];
let openPortsAllHosts = [];
let closedPorts = [];
let closedPortsAllHosts = [];
let spinner = [];
let shouldStop = false;
let startTime;
let startScanTime;
let endTime;
let endScanTime;
let serviceMap = [];
let openPortFileName;
let closedPortFileName;
let writeToLogFile = 'N';
let totalOpenPorts = 0;
let totalNumberOfHosts = 0;

function scanPort(port, host, portTimeout) {
    return new Promise((resolve) => {
        const socket = new net.Socket();

        const timer = setTimeout(() => {
            socket.destroy();
            // console.log(chalk.red('Port ' + port + ' is closed on host ' + host));
            spinner[port + ipToNumber(host)].stop();
            closedPorts.push(port);
            resolve();
        }, portTimeout);

        socket.on('connect', function() {
            clearTimeout(timer);
            // console.log(chalk.green('Port ' + port + ' is open on host ' + host));
            spinner[port + ipToNumber(host)].succeed(chalk.green('Port open: ' + port + ' service: ' + lookup('Port', port.toString()).Service));
            openPorts.push(port);
            socket.destroy();
            resolve();
        });

        socket.on('error', function() {
            clearTimeout(timer);
            // console.log(chalk.red('Port ' + port + ' is closed on host ' + host));
            spinner[port + ipToNumber(host)].stop();
            closedPorts.push(port);
            resolve();
        });

        socket.connect(port, host);
    });
}

async function scanPorts(startPort, endPort, startHost, endHost, portTimeout, batchSize) {
    let currentHost = startHost;
    
    while (ipToNumber(currentHost) <= ipToNumber(endHost)) {

        console.log('Scanning host: ' + currentHost);
        for(let i = startPort; i <= endPort; i += batchSize) {
            const promises = [];
            for(let j = i; j < i + batchSize && j <= endPort; j++) {
                //console.log('Scan port ' + j + ' of host ' + currentHost);
                let spinnerID = j + ipToNumber(currentHost);
                // console.log('Spinner ID: ' + spinnerID);
                spinner.push(spinnerID);
                spinner[spinnerID] = ora({discardStdin: false, text: 'Scanning port ' + j, spinner: 'point'}).start();
                promises.push(scanPort(j, currentHost, portTimeout));
            }
            await Promise.all(promises);
            // console.log('Completed batch of ports ' + i + ' to ' + (i + batchSize - 1) + ' of host ' + currentHost);
        }
        if (shouldStop) {
            console.log('Scanning stopped.');
            process.exit(0);
        }

        // Save to log file
        totalOpenPorts += openPorts.length;
        if(writeToLogFile.toUpperCase() === 'Y') {
            fs.appendFileSync(openPortFileName, currentHost + "," + startTime + "," + openPorts.toString() + "\n");
            fs.appendFileSync(closedPortFileName, currentHost + "," + startTime + "," + closedPorts.toString() + "\n");
        }

        openPortsAllHosts.push(currentHost, openPorts);
        closedPortsAllHosts.push(currentHost, closedPorts);
        // hostSpinner.suffixText = (chalk.yellow('-----------------------------------' + '\n'));
        console.log(chalk.yellow('-----------------------------------'));

        openPorts = [];
        closedPorts = [];
        currentHost = incrementIp(currentHost);
    }
    console.log('===================================');
    endTime = new Date().toISOString();
    endScanTime = new Date();
    console.log('End Time: ', endTime);
    let totalTime = endScanTime - startScanTime;
    const totalSeconds = totalTime / 1000;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const milliSeconds = Math.floor(totalTime % 1000);

    if (hours > 0){
        console.log('Total Time:', hours, 'hours', minutes, 'minutes', seconds,'seconds', milliSeconds, 'milliseconds');
    } else if(minutes > 0) {
        console.log('Total Time:', minutes, 'minutes', seconds,'seconds', milliSeconds, 'milliseconds');
    } else if(seconds > 0){
        console.log('Total Time:', seconds,'seconds', milliSeconds, 'milliseconds');
    } else{
        console.log('Total Time:', milliSeconds, 'milliseconds');
    }
    console.log('Total Hosts Scanned:', totalNumberOfHosts);
    console.log('Total Open Ports:', totalOpenPorts);
    console.log('===================================');
    process.exit(0);
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query, defaultValue) => {
    const questionAsync = util.promisify(rl.question).bind(rl);
    return questionAsync(`${query} (default: ${defaultValue}): `)
        .then(answer => answer || defaultValue);
};

async function main() {
    let resetFiles = 'N';
    let createNewFile = 'N';
    const startHost = await question('Enter start host: ', '127.0.0.1');
    const endHost = await question('Enter end host: ', '127.0.0.1');
    const startPort = parseInt(await question('Enter start port: ', '80'));
    const endPort = parseInt(await question('Enter end port: ', '443'));
    const portTimeout = parseInt(await question('Enter timeout in milliseconds: ', '300'));
    const batchSize = parseInt(await question('Enter batch size: ', '10'));
    writeToLogFile = await question('Write to log file? ', 'N');

    if(writeToLogFile.toUpperCase() === 'Y') {
        createNewFile = await question('Create new log files? ', 'N');
        if(createNewFile.toUpperCase() === 'N') {
            resetFiles = await question('Overwrite the files? ', 'Y');
        } else {
            resetFiles = 'N';
        }
    }
    
    

    rl.close();

    startTime = new Date().toISOString();
    startScanTime = new Date();
    
    if(writeToLogFile.toUpperCase() === 'Y') {
        if(createNewFile.toUpperCase() === 'Y') {
            openPortFileName = './log/openPorts_' + startTime + '_' + startHost + '_' + endHost + '_' + startPort + '_' + endPort + '.txt';
            closedPortFileName = './log/closedPorts_' + startTime + '_' + startHost + '_' + endHost + '_' + startPort + '_' + endPort + '.txt';
            fs.writeFileSync(openPortFileName, '');
            fs.writeFileSync(closedPortFileName, '');
        }else{
            openPortFileName = './log/openPorts.txt';
            closedPortFileName = './log/closedPorts.txt';
        }

        if(resetFiles.toUpperCase() === 'Y') {
            fs.writeFileSync('./log/openPorts.txt', '');
            fs.writeFileSync('./log/closedPorts.txt', '');
        }
    }else{
        openPortFileName = '';
        closedPortFileName = '';
    }

    totalNumberOfHosts = ipToNumber(endHost) - ipToNumber(startHost) + 1;

    console.log(chalk.red('-----------------------------------'));
    console.log('Start Time:', chalk.yellow(startTime));
    console.log('Start Host:', chalk.yellow(startHost));
    console.log('End Host:', chalk.yellow(endHost));
    console.log('Total Hosts:', chalk.yellow(totalNumberOfHosts));
    console.log('Start Port:', chalk.yellow(startPort));
    console.log('End Port:', chalk.yellow(endPort));
    console.log('Port Timeout:', chalk.yellow(portTimeout));
    console.log('Batch Size:', chalk.yellow(batchSize));
    console.log('Write to Log File:', chalk.yellow(writeToLogFile));
    if(writeToLogFile.toUpperCase() === 'Y') {
        console.log('Create new log files:', chalk.yellow(createNewFile));
        console.log('Open Ports File:', chalk.yellow(openPortFileName));
        console.log('Closed Ports File:', chalk.yellow(closedPortFileName));
    }
    console.log(chalk.red('==================================='));
    
    scanPorts(startPort, endPort, startHost, endHost, portTimeout, batchSize);
}

function incrementIp(ip) {
    let segments = ip.split('.').map(Number);
    if (segments.length !== 4) throw new Error('Invalid IP address');

    for (let i = segments.length - 1; i >= 0; i--) {
        if (segments[i] < 255) {
            segments[i]++;
            break;
        } else if (i !== 0) {
            segments[i] = 0;
        } else {
            throw new Error('Cannot increment IP address beyond 255.255.255.255');
        }
    }

    return segments.join('.');
}

function ipToNumber(ip) {
    return ip.split('.').reduce((ipInt, octet) => (ipInt<<8) + parseInt(octet), 0) >>> 0;
}

process.on('SIGINT', function() {
    console.log( "\nGracefully shutting down from SIGINT (Ctrl-C)" );
    shouldStop = true;
});

function lookup(column, value) {
    return serviceMap.find(row => row[column] === value);
}

fs.createReadStream('./service-names-port-numbers.csv')
  .pipe(csv())
  .on('data', (row) => {
    serviceMap.push(row);
  })
  .on('end', () => {
    console.log('Service names sccessfully loaded');
    main();
});
