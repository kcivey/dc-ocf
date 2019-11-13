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
const {getNeighborhoodName} = require('./lib/dc-neighborhoods');
const OcfDisclosures = require('./lib/ocf-disclosures');
const yamlFile = `${__dirname}/dcision${argv.year.toString().substr(-2)}.yaml`;
const templateFile = `${__dirname}/src/dc-2020-candidates.html.tpl`;
const majorParties = [
    'Democratic',
    'Libertarian',
    'Republican',
    'Statehood Green',
];
const partyAbbr = {
    Democratic: 'Dem',
    Libertarian: 'Lib',
    Republican: 'Rep',
    'Statehood Green': 'StG',
    Independent: 'Ind',
    Other: 'Oth',
    Nonpartisan: '',
};

main().catch(console.trace);

async function main() {
    let records = readYaml();
    if (argv.update) {
        const newRecords = await getNewRecords();
        records = combineRecords(records, newRecords);
    }
    writeYaml(records);
    writeHtml(records);
}

function readYaml() {
    try {
        return yaml.safeLoad(fs.readFileSync(yamlFile, 'utf8'));
    }
    catch (err) {
        if (err.code !== 'ENOENT') {
            throw err;
        }
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
    const records = (await ocf.findNewRecords(lastSeen)).Candidate;
    return objectify(await transformRecords(records), ['party', 'office']);
}

async function transformRecords(records) {
    const newRecords = records
        .map(
            function (r) {
                const newRec = {};
                for (const [key, value] of Object.entries(r)) {
                    newRec[underscored((key))] = typeof value === 'string' ? value.trim() : value;
                }
                return newRec;
            }
        )
        .sort(function (a, b) {
            return a.office.localeCompare(b.office) ||
                a.party_name.localeCompare(b.party_name) ||
                a.last_name.localeCompare(b.last_name) ||
                a.first_name.localeCompare(b.first_name);
        })
        .map(function (r) {
            r.party = r.party_name === 'Democrat'
                ? 'Democratic'
                : r.party_name === 'Non-Partisan'
                    ? 'Nonpartisan'
                    : r.party_name;
            r.office = r.office.replace('D.C. State Board of Education', 'SBOE');
            for (const key of [
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
            r.address = m[1].replace(/ Avenue\b/, ' Ave')
                .replace(/ Street\b/, ' St')
                .replace(/ Place\b/, ' Pl')
                .replace(/[.,]/g, '');
            r.zip = m[2];
            r.candidate_name = r.candidate_name.replace(/^(?:[DM]r|Mr?s)\.? /, '');
            r.first_name = r.first_name.replace(/^(?:[DM]r|Mr?s)\.? /, '');
            if (r.last_name === 'Grosman') { // kluge to fix OCF typo
                r.last_name = 'Grossman';
                r.candidate_name = r.candidate_name.replace('Grosman', 'Grossman');
                r.name = r.name.replace('Grosman', 'Grossman');
            }
            else if (r.last_name === 'Hernandez') { // kluge to fix OCF typo
                r.email = r.email.replace('hernandezd1', 'hernandezdl');
            }
            else if (r.committee_phone && r.committee_phone.match(/236-4074$/)) { // remove personal phone number
                r.committee_phone = '';
            }
            if (['Jordan Grossman', 'Patrick Kennedy', 'Kelvin Brown'].includes(r.candidate_name) &&
                r.committee_key.match(/^PCC/)) {
                r.committee_key = ''; // remove erroneous PCCs
            }
            if (r.fair_elections == null) {
                r.fair_elections = r.committee_key
                    ? (r.committee_key.match(/^PCC/) ? false : null)
                    : (r.committee_key == null ? null : true);
            }
            return r;
        });
    for (const r of newRecords) {
        try {
            r.neighborhood = await getNeighborhoodName(r.address);
        }
        catch (err) {
            // ignore if address can't be found
        }
    }
    return newRecords;
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
                const existingCandidate = records[party][office].find(function (r) {
                    return r.last_name === candidate.last_name &&
                        r.first_name === candidate.first_name;
                });
                if (existingCandidate) {
                    Object.assign(existingCandidate, candidate);
                }
                else {
                    records[party][office].push(candidate);
                }
            }
            records[party][office].sort(function (a, b) {
                return a.last_name.localeCompare(b.last_name) ||
                    a.first_name.localeCompare(b.first_name);
            });
        }
    }
    return records;
}

function writeYaml(records) {
    fs.writeFileSync(yamlFile, yaml.safeDump(records, {lineWidth: 120}));
}

function writeHtml(records) {
    const template = _.template(fs.readFileSync(templateFile, 'utf8'));
    const outputFile = templateFile.replace(/\.tpl$/, '');
    const recordsByElection = {};
    const generalName = 'General Election, November 3, 2020';
    for (const [party, recordsByOffice] of Object.entries(records)) {
        const election = majorParties.includes(party) ? `${party} Primary Election, June 2, 2020` : generalName;
        if (!recordsByElection[election]) {
            recordsByElection[election] = {};
        }
        for (let [office, candidates] of Object.entries(recordsByOffice)) {
            if (election === generalName && office === 'Council At-Large') {
                office += ' (2 seats)';
            }
            if (!recordsByElection[election][office]) {
                recordsByElection[election][office] = [];
            }
            recordsByElection[election][office] = recordsByElection[election][office]
                .concat(
                    candidates
                        .filter(c => !c.termination_approved)
                        .map(function (c) {
                            const newC = {...c, party, party_abbr: partyAbbr[party]};
                            if (c.elections) {
                                newC.elections = [...c.elections]
                                    .map(function (e) {
                                        return {
                                            ...e,
                                            party_abbr: partyAbbr[e.party],
                                            office: addAbbr(e.office),
                                        };
                                    });
                            }
                            return newC;
                        })
                );
            if (election !== generalName) {
                if (!recordsByElection[generalName]) {
                    recordsByElection[generalName] = {};
                }
                if (office === 'Council At-Large') {
                    office += ' (2 seats)';
                }
                if (!recordsByElection[generalName][office]) {
                    recordsByElection[generalName][office] = [
                        {
                            candidate_name: `(${party} nominee)`,
                            party_abbr: partyAbbr[party],
                            party,
                        },
                    ];
                }
            }
        }
    }
    let currentContent;
    try {
        currentContent = fs.readFileSync(outputFile, 'utf8').replace(/(\(updated )[^)]+\)/, '$1)');
    }
    catch (err) {
        if (err.code !== 'ENOENT') { // ignore if file not found
            throw err;
        }
    }
    if (currentContent !== template({recordsByElection, updated: ''})) {
        fs.writeFileSync(
            outputFile,
            template({
                recordsByElection,
                updated: new Date().toLocaleDateString('en-US', {year: 'numeric', day: 'numeric', month: 'long'}),
            })
        );
    }
    function addAbbr(office) {
        return office.replace(/\b(ANC|SBOE)\b/, function (m, m1) {
            const spelledOut = {ANC: 'Advisory Neighborhood Commissioner', SBOE: 'State Board of Education'}[m1];
            return spelledOut ? `<abbr title="${spelledOut}">${m1}</abbr>` : m1;
        });
    }
}

function objectify(arr, keyNames) {
    if (typeof keyNames === 'string') {
        keyNames = [keyNames];
    }
    if (!keyNames.length) {
        return arr;
    }
    const unsorted = {};
    const keyName = keyNames[0];
    for (const obj of arr) {
        const key = obj[keyName];
        delete obj[keyName];
        if (!unsorted[key]) {
            unsorted[key] = [];
        }
        unsorted[key].push(obj);
    }
    const sorted = {};
    for (const key of Object.keys(unsorted).sort(keySort)) {
        const subarray = unsorted[key];
        sorted[key] = objectify(subarray, keyNames.slice(1));
    }
    return sorted;
}

function keySort(a, b) {
    const [, a1, a2] = a.match(/^(?:(.+?)\s+)?(.+)$/);
    const [, b1, b2] = b.match(/^(?:(.+?)\s+)?(.+)$/);
    return a2.localeCompare(b2) || a1.localeCompare(b1);
}
