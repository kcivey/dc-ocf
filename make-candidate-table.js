#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const yaml = require('js-yaml');
const _ = require('lodash');
const underscored = require('underscore.string/underscored');
const argv = require('yargs')
    .options({
        update: {
            type: 'boolean',
            describe: 'get new data from OCF site',
        },
        verbose: {
            type: 'boolean',
            describe: 'print something about what\'s going on',
            alias: 'v',
        },
        year: {
            type: 'number',
            describe: 'retrieve only for specified election year',
            default: Math.floor((new Date().getFullYear() + 1) / 2) * 2,
            requiresArg: true,
        },
    })
    .strict(true)
    .argv;
const OcfDisclosures = require('./lib/ocf-disclosures');
const yamlFile = `${__dirname}/dcision${argv.year.toString().substr(-2)}.yaml`;
const templateFile = `${__dirname}/candidates.html.tpl`;

main().catch(console.trace);

async function main() {
    let records = readYaml();
    if (argv.update) {
        const newRecords = await getNewRecords();
        records = combineRecords(records, newRecords);
        writeYaml(records);
    }
    writeHtml(records);
}

function readYaml() {
    try {
        return yaml.safeLoad(fs.readFileSync(yamlFile, 'utf8'));
    }
    catch (err) {
        return {};
    }
}

async function getNewRecords() {
    const ocf = new OcfDisclosures({
        verbose: argv.verbose,
        limit: 100,
        year: argv.year,
        withDetails: true,
        useLastSeen: false,
    });
    const lastSeen = await ocf.getLastSeen(['Candidate']);
    const records = await ocf.findNewRecords(lastSeen);
    return transformRecords(records);
}

function transformRecords(flatRecordsByType) {
    const underscoredRecords = flatRecordsByType['Candidate']
        .map(
            function (rec) {
                const newRec = {};
                for (const [key, value] of Object.entries(rec)) {
                    newRec[underscored((key))] = typeof value === 'string' ? value.trim() : value;
                }
                return newRec;
            }
        )
        .sort(
            function (a, b) {
                return a.office.localeCompare(b.office) ||
                    a.party_name.localeCompare(b.party_name) ||
                    a.last_name.localeCompare(b.last_name) ||
                    a.first_name.localeCompare(b.first_name);
            }
        );
    const recordsByPartyAndOffice = {};
    for (const r of underscoredRecords) {
        const office = r.office;
        const party = r.party_name;
        for (const key of [
            'office',
            'office_sought',
            'party_name',
            'party_affiliation',
            'name_of_committee',
            'filer_type_id',
            'election_year_description',
            'ocf_identification_no',
            'committee_alphanumeric_id',
        ]) {
            delete r[key];
        }
        const m = r.address.match(/^(.+), Washington, DC (\d+)$/);
        assert(m, `Unexpected address format "${r.address}"`);
        r.address = m[1];
        r.zip = m[2];
        if (!recordsByPartyAndOffice[party]) {
            recordsByPartyAndOffice[party] = {};
        }
        if (!recordsByPartyAndOffice[party][office]) {
            recordsByPartyAndOffice[party][office] = [];
        }
        recordsByPartyAndOffice[party][office].push(r);
    }
    return recordsByPartyAndOffice;
}

function combineRecords(records, newRecords) {
    for (const [party, recordsByOffice] of Object.entries(newRecords)) {
        if (!records[party]) {
            records[party] = {};
        }
        for (const [office, candidates] of Object.entries(recordsByOffice)) {
            if (!records[party][office]) {
                records[party][office] = [];
            }
            for (const candidate of candidates) {
                const existingCandidate = records[party][office].find(r => r.id === candidate.id);
                if (existingCandidate) {
                    Object.assign(existingCandidate, candidate);
                }
                else {
                    records[party][office].push(candidate);
                }
            }
        }
    }
    return records;
}

function writeYaml(records) {
    fs.writeFileSync(yamlFile, yaml.safeDump(records));
}

function writeHtml(records) {
    const template = _.template(fs.readFileSync(templateFile, 'utf8'));
    const outputFile = templateFile.replace(/\.tpl$/, '');
    fs.writeFileSync(outputFile, template({records}));
}
