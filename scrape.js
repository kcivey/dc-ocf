#!/usr/bin/env node

const fs = require('fs');
const cacheFile = 'cache/last-seen-committees.json';
const Browser = require('zombie');
const browser = new Browser({waitDuration: '30s'});

browser.visit('https://efiling.ocf.dc.gov/Disclosure')
    .then(getTypes)
    .then(getLastSeen)
    .then(findNewRecords);

function getTypes() {
    const types = [];
    const options = browser.field('#FilerTypeId').options;
    for (const option of options) {
        if (option.value) {
            types.push(option.text);
        }
    }
    return types;
}

function getLastSeen(types) {
    return new Promise(function (resolve, reject) {
        fs.readFile(cacheFile, function (err, json) {
            const lastSeen = err ? {} : JSON.parse(json);
            for (const type of types) {
                if (!lastSeen[type]) {
                    lastSeen[type] = null;
                }
            }
            resolve(lastSeen);
        });
    });
}

async function findNewRecords(lastSeen) {
    const types = Object.keys(lastSeen);
    for (const type of types) {
        const newRecords = await findNewRecordsForType(type, lastSeen[type]);
        console.log(type, newRecords);
        if (newRecords[0]) {
            lastSeen[type] = getRecordKey(newRecords[0]);
        }
    }
    fs.writeFileSync(cacheFile, JSON.stringify(lastSeen, null, 2));
    return lastSeen;
}

function getRecordKey(record) {
    return record.CommitteeKey || record.CandidateKey;
}

function findNewRecordsForType(type, lastSeenKey) {
    return browser.select('#FilerTypeId', type)
        .then(pause)
        .then(() => browser.click('#btnSubmitSearch'))
        .then(getSearchData)
        .then(function (records) {
            const newRecords = [];
            for (const record of records) {
                const key = getRecordKey(record);
                if (lastSeenKey && key === lastSeenKey) {
                    break;
                }
                newRecords.push(record);
            }
            return newRecords;
        });
}

function pause() {
    return new Promise(resolve => setTimeout(resolve, 5000));
}

function getSearchData() {
    let i = browser.resources.length;
    while (i > 0) {
        i--;
        const resource = browser.resources[i];
        if (resource.request.url.match(/\/Search$/)) {
            return JSON.parse(resource.response.body).data;
        }
    }
}
