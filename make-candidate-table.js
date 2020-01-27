#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const yaml = require('js-yaml');
const _ = require('lodash');
const underscored = require('underscore.string/underscored');
const {pdfToText} = require('pdf-to-text');
const request = require('request-promise-native');
const cheerio = require('cheerio');
const tempy = require('tempy');
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
const abbrParty = {};
for (const [party, abbr] of Object.entries(partyAbbr)) {
    abbrParty[abbr] = party;
}

main().catch(console.trace);

async function main() {
    let records = readYaml();
    if (argv.update) {
        const newRecords = await getNewRecords();
        records = combineRecords(records, newRecords);
    }
    const moreRecords = await getBoePickups();
    records = combineRecords(records, moreRecords);
    for (const election of Object.keys(records)) {
        for (const party of Object.keys(records[election])) {
            for (const office of Object.keys(records[election][party])) {
                for (const r of records[election][party][office]) {
                    if (r.neighborhood) {
                        continue;
                    }
                    try {
                        r.neighborhood = await getNeighborhoodName(r.address);
                    }
                    catch (err) {
                        // ignore if address can't be found
                    }
                }
            }
        }
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
    for (const r of records) {
        if (r.ElectionDescription === 'Special Election' && /Non-?Partisan/i.test(r.PartyName)) {
            r.PartyName = r.LastName === 'Venice' ? 'Republican' : 'Democratic';
        }
    }
    return objectify(await transformRecords(records), ['election_description', 'party', 'office']);
}

function transformRecords(records) {
    return records
        .map(
            function (r) {
                const newRec = {};
                for (const [key, value] of Object.entries(r)) {
                    newRec[underscored((key))] = typeof value === 'string' ? value.trim() : value;
                }
                return newRec;
            }
        )
        .filter(r => !/committee/i.test(r.office))
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
            const m = r.address.match(/^(.+), Washington,? DC (\d+)$/i);
            if (m) {
                r.address = standardizeAddress(m[1]);
                r.zip = m[2];
            }
            r.candidate_name = r.candidate_name.replace(/^(?:[DM]r|Mr?s)\.? /i, '');
            if (!/[A-Z][a-z]/.test(r.candidate_name)) { // handle all-caps or all-lowercase name
                r.candidate_name = r.candidate_name.toLowerCase().replace(/\b[a-z]/g, m => m.toUpperCase());
            }
            r.first_name = r.first_name.replace(/^(?:[DM]r|Mr?s)\.? /, '');
            if (r.last_name === 'Grosman') { // kluge to fix OCF typo
                r.last_name = 'Grossman';
                r.candidate_name = r.candidate_name.replace('Grosman', 'Grossman');
                r.name = r.name.replace('Grosman', 'Grossman');
            }
            else if (r.last_name === 'Carmichel') { // kluge to fix OCF typo
                r.last_name = 'Carmichael';
                r.candidate_name = r.candidate_name.replace('Carmichel', 'Carmichael');
            }
            else if (r.last_name === 'Lewis George') {
                r.last_name = 'George';
                r.first_name = 'Janeese Lewis';
            }
            else if (r.last_name === 'Hernandez') { // kluge to fix OCF typo
                r.email = r.email.replace('hernandezd1', 'hernandezdl');
            }
            else if (r.first_name === "Jeanne'") {
                r.first_name = 'Jeanné';
                r.candidate_name = r.candidate_name.replace("Jeanne'", 'Jeanné');
            }
            else if (r.committee_phone && r.committee_phone.match(/236-4074$/)) { // remove personal phone number
                r.committee_phone = '';
            }
            if (['Jordan Grossman', 'Patrick Kennedy', 'Kelvin Brown'].includes(r.candidate_name) &&
                r.committee_key &&
                r.committee_key.match(/^PCC/)) {
                r.committee_key = ''; // remove erroneous PCCs
            }
            if (r.fair_elections == null) {
                if (r.office.match(/Committee|^US|Delegate/)) {
                    r.fair_elections = false;
                }
                else {
                    r.fair_elections = r.committee_key
                        ? (r.committee_key.match(/^PCC/) ? false : null)
                        : (r.committee_key == null ? null : true);
                }
            }
            if (!majorParties.includes(r.party) && r.election_description === 'Primary Election') {
                r.election_description = 'General Election';
            }
            return r;
        });
}

function combineRecords(records, newRecords) {
    for (const [electionDescription, recordsByParty] of Object.entries(newRecords)) {
        if (!records[electionDescription]) {
            records[electionDescription] = {};
        }
        for (const [party, recordsByOffice] of Object.entries(recordsByParty)) {
            if (!records[electionDescription][party]) {
                records[electionDescription][party] = {};
            }
            for (const [office, candidates] of Object.entries(recordsByOffice)) {
                if (!records[electionDescription][party][office]) {
                    records[electionDescription][party][office] = [];
                }
                for (const candidate of candidates) {
                    let first = candidate.first_name.replace(/^(\S+) .*/, '$1');
                    if (first === 'Mike') {
                        first = 'Michael';
                    }
                    const existingCandidate = records[electionDescription][party][office].find(function (r) {
                        let existingFirst = r.first_name.replace(/^(\S+) .*/, '$1');
                        if (existingFirst === 'Mike') {
                            existingFirst = 'Michael';
                        }
                        return r.last_name === candidate.last_name &&
                            existingFirst === first &&
                            (!r.committee_name || !candidate.committee_name ||
                                r.committee_name === candidate.committee_name);
                    });
                    if (existingCandidate) {
                        if (candidate.fair_elections == null) { // eslint-disable-line max-depth
                            delete candidate.fair_elections;
                        }
                        if (existingCandidate.candidate_name) { // eslint-disable-line max-depth
                            delete candidate.candidate_name;
                        }
                        Object.assign(existingCandidate, candidate);
                    }
                    else {
                        records[electionDescription][party][office].push(candidate);
                    }
                }
                records[electionDescription][party][office].sort(function (a, b) {
                    return a.last_name.localeCompare(b.last_name) ||
                        a.first_name.localeCompare(b.first_name);
                });
            }
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
    const specialName = 'Special Election, June 16, 2020';
    for (const [electionDescription, recordsByParty] of Object.entries(records)) {
        for (const [party, recordsByOffice] of Object.entries(recordsByParty)) {
            const election = electionDescription === 'General Election'
                ? generalName
                : electionDescription === 'Special Election'
                    ? specialName
                    : `${party} Primary Election, June 2, 2020`;
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
                    if (!office.match(/Committee/) && !recordsByElection[generalName][office]) {
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
    }
    // Move general election to end
    const general = recordsByElection[generalName];
    delete recordsByElection[generalName];
    recordsByElection[generalName] = general;
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

async function getBoePickups() {
    const newsUrl = 'https://dcboe.org/Community-Outreach/News';
    if (argv.verbose) {
        console.warn(newsUrl);
    }
    const html = await request(newsUrl);
    const $ = cheerio.load(html);
    const pickups = [];
    for (const link of $('.article .newsItem a').get()) {
        const text = $(link).text()
            .trim();
        if (!text.match(/^Candidate List/)) {
            continue;
        }
        const election = text.match(/SPECIAL/i) ? 'special' : 'primary';
        const pdfUrl = new URL($(link).attr('href'), newsUrl).toString();
        if (argv.verbose) {
            console.warn(pdfUrl);
        }
        const pdfText = await getPdfText(pdfUrl);
        if (election === 'special') {
            const lineRe =
                /^(\S+(?: \S+)+) +(\w{3}) +(\S+(?: \S+)+|) +((?:P\.?O\.? Box )?\d.*?) (\d{5}) +(\d[-\d]+) +([\d/]+) +([\d/]*) +(\S+)\s*$/; // eslint-disable-line max-len
            const office = 'Council Ward 2';
            for (const line of pdfText.split('\n')) {
                if (!/^\S/.test(line)) {
                    continue;
                }
                const m = line.match(lineRe);
                assert(m, `Unexpected format in PDF:\n${line}`);
                pickups.push({
                    election_description: 'Special Election',
                    office,
                    candidate_name: m[1],
                    party_name: abbrParty[m[2]] || m[2],
                    contact_name: m[3],
                    address: standardizeAddress(m[4]),
                    zip: m[5],
                    phone: m[6],
                    boe_pickup_date: m[7],
                    boe_filing_date: m[8],
                    email: m[9],
                });
            }
        }
        else {
            const lineRe =
                /^(\S+(?: \S+)+)  +(\S+(?: \S+)+|) +((?:P\.?O\.? Box )?\d.*?) (\d{5})? +(\d[-\d]+) +([\d/]+) +([\d/]*) +(\S+)\s*$/; // eslint-disable-line max-len
            for (const page of pdfText.split('\f')) {
                if (!/\S/.test(page)) {
                    continue;
                }
                let party;
                const m = page.match(/District of Columbia Board of Elections\n +(.+?)(?: List of| Candidates| *\n)/);
                assert(m, `Missing party:\n${page}`);
                if (m) {
                    party = m[1];
                }
                let office;
                for (const line of page.split('\n')) {
                    if (!/^\S/.test(line) || /^Candidate's/.test(line)) {
                        continue;
                    }
                    if (/^\S+(?: \S+)*$/.test(line)) {
                        office = line;
                        continue;
                    }
                    const m = line.match(lineRe);
                    assert(m, `Unexpected format in PDF:\n${JSON.stringify(line)}`);
                    assert(office, `Missing office for "${line}"`);
                    if (/Committee/.test(office)) {
                        continue; // skip party positions
                    }
                    pickups.push({
                        election_description: 'Primary Election',
                        office: standardizeOffice(office),
                        candidate_name: m[1],
                        party_name: party,
                        contact_name: m[2],
                        address: standardizeAddress(m[3]),
                        zip: m[4] || '',
                        phone: m[5],
                        boe_pickup_date: m[6],
                        boe_filing_date: m[7],
                        email: m[8],
                    });
                }
            }
        }
    }
    for (const r of pickups) {
        const m = r.candidate_name.match(/^(.*?) (\S+)$/);
        assert(m, `Unexpected name format "${r.candidate_name}"`);
        r.first_name = m[1];
        r.last_name = m[2];
    }
    return objectify(await transformRecords(pickups), ['election_description', 'party', 'office']);
}

async function getPdfText(pdfUrl) {
    const pdfContent = await request({url: pdfUrl, gzip: true, encoding: null});
    const file = tempy.file({extension: 'pdf'});
    fs.writeFileSync(file, pdfContent);
    return new Promise(function (resolve, reject) {
        pdfToText(file, {}, function (err, text) {
            if (err) {
                return reject(err);
            }
            return resolve(text);
        });
    });
}

function standardizeAddress(address) {
    return address.replace(/ Avenue\b/, ' Ave')
        .replace(/ Street\b/, ' St')
        .replace(/ Place\b/, ' Pl')
        .replace(/[.,]/g, '');
}

function standardizeOffice(office) {
    return office === 'Presidential Nominee'
        ? 'President'
        : /Delegate to the House/.test(office)
            ? 'Delegate to the US House'
            : office.replace(/(.*) Member of the Council of the District of Columbia/, 'Council $1')
                .replace('At-large', 'At-Large')
                .replace('United States', 'US');
}
