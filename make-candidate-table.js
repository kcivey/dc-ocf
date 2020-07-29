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
const yargs = require('yargs');
const {getNeighborhoodName} = require('./lib/dc-neighborhoods');
const OcfDisclosures = require('./lib/ocf-disclosures');
const argv = getArgv();
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
    DEM: 'Dem',
    REP: 'Rep',
    LBT: 'Lib',
    STG: 'StG',
    STHG: 'StG',
    IND: 'Ind',
    'N/A': '',
};
const abbrParty = {};
for (const [party, abbr] of Object.entries(partyAbbr)) {
    if (!abbrParty[abbr]) {
        abbrParty[abbr] = party;
    }
}

main().catch(console.trace);

async function main() {
    let records = readYaml();
    if (argv['print-emails']) {
        printEmails(records);
        return;
    }
    if (argv.update) {
        const newRecords = await getNewRecords();
        records = combineRecords(records, newRecords);
    }
    // records = removeBoeDates(records); // to remove candidates no longer listed
    const moreRecords = await getBoePickups();
    records = combineRecords(records, moreRecords);
    for (const election of Object.keys(records)) {
        for (const party of Object.keys(records[election])) {
            for (const office of Object.keys(records[election][party])) {
                for (const r of records[election][party][office]) {
                    if (r.hasOwnProperty('neighborhood')) {
                        continue;
                    }
                    try {
                        r.neighborhood = await getNeighborhoodName(r.address);
                    }
                    catch (err) {
                        r.neighborhood = null; // if address can't be found
                    }
                }
            }
        }
    }
    writeYaml(records);
    writeHtml(records);
    // writeEndorsements(records);
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
                a.first_name.localeCompare(b.first_name) ||
                (a.committee_id - b.committee_id);
        })
        .map(function (r) {
            r.party = {
                Democrat: 'Democratic',
                'Non-Partisan': 'Nonpartisan',
                'DC Statehood Green': 'Statehood Green',
                'D.C. Statehood Green Party': 'Statehood Green',
            }[r.party_name] || r.party_name;
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
            if (!r.address) {
                r.address = '';
            }
            const m = r.address.match(/^(.+), Washington,? DC (\d+)$/i);
            if (m) {
                r.address = standardizeAddress(m[1]);
                r.zip = m[2];
            }
            r.candidate_name = r.candidate_name.replace(/^(?:[DM]r|Mr?s)\.? /i, '');
            if (r.committee_name === 'N/A') {
                r.committee_name = '';
            }
            if (!/[A-Z][a-z]/.test(r.candidate_name)) { // handle all-caps or all-lowercase name
                r.candidate_name = r.candidate_name.toLowerCase().replace(/\b[a-z]/g, m => m.toUpperCase());
            }
            r.first_name = r.first_name.replace(/^(?:[DM]r|Mr?s)\.? /, '')
                .replace(/\s*\(.+\)/, '')
                .replace(/\s*"[^"]*"/, '');
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
            else if (/^Johnson[- ]Law$/.test(r.last_name)) {
                r.last_name = 'Law';
                r.first_name = 'LaJoy Johnson';
            }
            else if (r.last_name === 'Hernandez') { // kluge to fix OCF typo
                r.email = r.email.replace('hernandezd1', 'hernandezdl');
            }
            else if (r.first_name === "Jeanne'") {
                r.first_name = 'Jeanné';
                r.candidate_name = r.candidate_name.replace("Jeanne'", 'Jeanné');
            }
            else if (r.last_name === 'Bishop-Henchman') {
                r.last_name = 'Henchman';
                r.candidate_name = 'Joseph Henchman';
            }
            else if (r.first_name === 'Martin Miguel') {
                r.first_name = 'Martín Miguel';
                r.candidate_name = 'Martín Miguel Fernandez';
            }
            else if (r.first_name === 'Jacques' && r.last_name === 'Patterson') {
                r.first_name = 'Jacque';
                r.candidate_name = 'Jacque Patterson';
            }
            else if (r.last_name === 'Robinson Paul') {
                r.last_name = 'Robinson-Paul';
                r.candidate_name = 'Joyce (Chestnut) Robinson-Paul';
            }
            else if (r.committee_phone && r.committee_phone.match(/236-4074$/)) { // remove personal phone number
                r.committee_phone = '';
            }
            if (['Jordan Grossman', 'Patrick Kennedy', 'Kelvin Brown', 'Franklin Garcia', 'Carlene Reid']
                .includes(r.candidate_name) &&
                r.committee_key &&
                r.committee_key.match(/^PCC/)) {
                r.committee_key = ''; // remove erroneous PCCs
            }
            if (r.fair_elections == null) {
                if (r.office.match(/Committee|Party|^US|Delegate/)) {
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
                    const first = getFirstName(candidate.first_name);
                    const existingCandidate = records[electionDescription][party][office].find(function (r) {
                        const existingFirst = getFirstName(r.first_name);
                        return (r.committee_name && candidate.committee_name &&
                            r.committee_name === candidate.committee_name) ||
                            (
                                r.last_name === candidate.last_name &&
                                existingFirst === first &&
                                (!r.committee_id || !candidate.committee_id ||
                                    r.committee_id === candidate.committee_id)
                            );
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
                        a.first_name.localeCompare(b.first_name) ||
                        (a.committee_id - b.committee_id);
                });
            }
        }
    }
    return records;

    function getFirstName(name) {
        // normalize is to handle Unicode combining diacritics
        let first = name.normalize('NFC').replace(/^(\S+) ?.*/, '$1');
        first = {
            Mike: 'Michael',
            Nate: 'Nathan',
            Joe: 'Joseph',
            "Le'Troy": 'Troy',
            'Martín': 'Martin',
            Fred: 'Frederick',
            Fria: 'Free',
            Chris: 'Christopher',
        }[first] || first;
        return first;
    }
}

function printEmails(records) {
    for (const [electionDescription, recordsByParty] of Object.entries(records)) {
        if (electionDescription !== 'Primary Election') {
            continue;
        }
        for (const [party, recordsByOffice] of Object.entries(recordsByParty)) {
            if (party !== 'Democratic') {
                continue;
            }
            for (const [office, candidates] of Object.entries(recordsByOffice)) {
                console.log(office.toUpperCase());
                for (const candidate of candidates) {
                    if (omitCandidate(candidate, electionDescription)) {
                        continue;
                    }
                    console.log(`${candidate.candidate_name} <${candidate.email}>`);
                }
                console.log('');
            }
        }
    }
}

function writeYaml(records) {
    fs.writeFileSync(yamlFile, yaml.safeDump(records, {lineWidth: 120}).normalize('NFC'));
}

function writeHtml(records) {
    const template = _.template(fs.readFileSync(templateFile, 'utf8'));
    const outputFile = templateFile.replace(/\.tpl$/, '');
    const generalName = 'General Election, November 3, 2020';
    const specialName = 'Special Election, June 16, 2020';
    let recordsByElection = {};
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
                            .filter(c => !omitCandidate(c, electionDescription))
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
                    )
                    .sort(function (a, b) {
                        return a.last_name.localeCompare(b.last_name) ||
                            a.first_name.localeCompare(b.first_name);
                    });
                if (election !== generalName) {
                    if (!recordsByElection[generalName]) {
                        recordsByElection[generalName] = {};
                    }
                    if (office === 'Council At-Large') {
                        office += ' (2 seats)';
                    }
                    if (office.match(/Committee|Party/)) {
                        continue; // skip party positions
                    }
                    if (!recordsByElection[generalName][office]) {
                        recordsByElection[generalName][office] = [];
                    }

                    /*
                    if (!recordsByElection[generalName][office].some(r => r.party === party)) {
                        recordsByElection[generalName][office].push({
                            candidate_name: `(${party} nominee)`,
                            party_abbr: partyAbbr[party],
                            party,
                        });
                    }
                    */
                }
            }
        }
    }
    // Move general election to start now that others are over
    recordsByElection = {[generalName]: recordsByElection[generalName], ...recordsByElection};
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

function getArgv() {
    const argv = yargs
        .options({
            'general-filing': {
                type: 'boolean',
                describe: 'omit all candidates who have not filed with BOE',
            },
            'primary-filing': {
                type: 'boolean',
                describe: 'omit primary candidates who have not filed with BOE',
            },
            'print-emails': {
                type: 'boolean',
                describe: 'print emails and exit',
            },
            'special-filing': {
                type: 'boolean',
                describe: 'omit special election candidates who have not filed with BOE',
            },
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
    if (argv['general-filing']) {
        argv['special-filing'] = true;
    }
    if (argv['special-filing']) {
        argv['primary-filing'] = true;
    }
    return argv;
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

/*
function removeBoeDates(records) {
    for (const recordsByParty of Object.values(records)) {
        for (const recordsByOffice of Object.values(recordsByParty)) {
            for (const candidates of Object.values(recordsByOffice)) {
                for (const candidate of candidates) {
                    if (!candidate.withdrew && candidate.boe_filing_date) {
                        candidate.boe_filing_date = '';
                    }
                }
            }
        }
    }
    return records;
}
*/

async function getBoePickups() {
    const newsUrl = 'https://dcboe.org/Candidates/2020-Candidates';
    if (argv.verbose) {
        console.warn(newsUrl);
    }
    const html = await request(newsUrl);
    const $ = cheerio.load(html);
    const pickups = [];
    for (const link of $('.article ul li a').get()) {
        const text = $(link).text()
            .trim();
        if (!text.match(/^Candidate List.+General/)) { // now that special is over, get only general
            continue;
        }
        const election = text.match(/Special/i) ? 'special' : text.match(/General/i) ? 'general' : 'primary';
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
                    boe_pickup_date: standardizeDate(m[7]),
                    boe_filing_date: standardizeDate(m[8]),
                    email: m[9],
                });
            }
        }
        else {
            const primary = election === 'primary';
            const lineRe = primary
                ? /^(\S+(?: \S+)*)  +?(\S+(?: \S+)+|) +((?:P\.?O\.? Box )?\d.*?)? (\d{5})? +(\d[-\d]+)? +([\d/]+)(?: +([\d/]*) +(\S+)\s*)?$/ // eslint-disable-line max-len
                : /^(\S+(?: \S+)+) +([A-Z/]{3,4}) +([\w.-]+(?: [\w.-]+)+|)  +((?:P\.?O\.? Box )?\d.*?|) (\d{5}|) +(\S+@\S+|) *(\d[-\d.]+|) *([\d/NA]*) *([\d/NA]*)\s*$/; // eslint-disable-line max-len
            const withdrewRe = /^(.+?)\s*\(withdrew (\d\d?\/\d\d?\/(?:\d\d|\d{4}))\)/i;
            let office;
            for (const page of pdfText.split('\f')) {
                if (!/\S/.test(page)) {
                    continue;
                }
                let party = '';
                if (primary) {
                    const m = page.match(
                        /District of Columbia Board of Elections\n +(.+?)(?: List of| Candidates| in Ballot Order| *\n)/
                    );
                    assert(m, `Missing party:\n${page}`);
                    party = m[1];
                }
                let prevOffice;
                for (let line of page.split('\n')) {
                    let withdrew = '';
                    if (!/^\S/.test(line) || /^Candidate's/.test(line)) {
                        continue;
                    }
                    line = line.replace(/\s+in the June .*/, ''); // formatting problem
                    if (/^\S+(?: \S+)*$/.test(line)) {
                        prevOffice = office;
                        office = line;
                        continue;
                    }
                    line = line.replace('DC BetterChoice', 'DCBetterChoice'); // kluge to handle error
                    let m = line.match(lineRe);
                    assert(m, `Unexpected format in PDF:\n${JSON.stringify(line)}`);
                    const values = [...m].slice(1);
                    let candidate = values.shift();
                    if (!primary) {
                        party = values.shift();
                        party = abbrParty[partyAbbr[party]] || party;
                    }
                    const email = primary ? values.pop() : values.splice(3, 1)[0];
                    const [contact, address, zip, phone, pickupDate, filingDate] = values;
                    assert(office, `Missing office for "${line}"`);
                    if (/Committee|Party/.test(office)) {
                        continue; // skip party positions
                    }
                    m = candidate.match(withdrewRe);
                    if (!m) {
                        m = (office + ' ' + candidate).match(withdrewRe);
                        if (m) { // eslint-disable-line max-depth
                            office = prevOffice;
                        }
                    }
                    if (m) {
                        candidate = m[1];
                        withdrew = standardizeDate(m[2]);
                    }
                    const record = {
                        election_description: election.substr(0, 1).toUpperCase() + election.substr(1) + ' Election',
                        office: standardizeOffice(office),
                        candidate_name: candidate,
                        party_name: party,
                        contact_name: contact,
                        address: standardizeAddress(address),
                        zip: zip || '',
                        phone: phone || '',
                        boe_pickup_date: standardizeDate(pickupDate),
                        boe_filing_date: standardizeDate(filingDate || ''),
                        email: email || '',
                    };
                    if (withdrew) {
                        record.withdrew = withdrew;
                    }
                    pickups.push(record);
                }
            }
        }
    }
    for (const r of pickups) {
        r.candidate_name = r.candidate_name.replace(/\s*-\s*/g, '-');
        const m = r.candidate_name.match(/^\(?(.*?) (\S*\w)(?:,? ([JS]r|I+|I?V|Ward \d))?\.?\)?$/i);
        assert(m, `Unexpected name format "${r.candidate_name}"`);
        r.candidate_name = `${m[1]} ${m[2]}`;
        if (m[3]) {
            r.candidate_name += ' ' + m[3];
        }
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
    return address
        ? address.replace(/ Avenue\b/, ' Ave')
            .replace(/ Street\b/, ' St')
            .replace(/ Place\b/, ' Pl')
            .replace(/[.,]/g, '')
        : '';
}

function standardizeOffice(office) {
    return /President/.test(office)
        ? 'President'
        : /Delegate to the .*House/.test(office)
            ? 'Delegate to the US House'
            : office.replace(/(.*) Member of the Council of the District of Columbia$/, 'Council $1')
                .replace(/(.*?)(?: District)? Member of the State Board of Education$/, 'SBOE $1')
                .replace('At-large', 'At-Large')
                .replace('United States', 'US');
}

function standardizeDate(d) {
    return d === 'N/A' ? '' : d.replace(/\/(?=\d\d$)/, '/20');
}

function omitCandidate(c, election) {
    return c.withdrew ||
        c.termination_approved ||
        (argv['primary-filing'] && /Primary/.test(election) && !c.boe_filing_date) ||
        (argv['special-filing'] && /Special/.test(election) && !c.boe_filing_date) ||
        (argv['general-filing'] && !c.boe_filing_date);
}

function writeEndorsements(records) { // eslint-disable-line no-unused-vars
    const candidateSet = new Set();
    const endorserSet = new Set();
    const links = [];
    const endorsementsByGroup = {};
    for (const election of Object.keys(records)) {
        for (const party of Object.keys(records[election])) {
            for (const office of Object.keys(records[election][party])) {
                if (!/Council/.test(office)) {
                    continue;
                }
                for (const r of records[election][party][office]) {
                    if (omitCandidate(r, election) || !r.endorsements) {
                        continue;
                    }
                    candidateSet.add(r.candidate_name);
                    for (const group of Object.keys(r.endorsements)) {
                        if (!endorsementsByGroup[group]) { // eslint-disable-line max-depth
                            endorsementsByGroup[group] = new Set();
                        }
                        endorsementsByGroup[group].add(r.candidate_name);
                        links.push({
                            source: group,
                            target: r.candidate_name,
                        });
                        endorserSet.add(group);
                    }
                }
            }
        }
    }
    const nodes = [
        ...[...candidateSet].sort().map(name => ({name, type: 'candidate'})),
        ...[...endorserSet].sort().map(name => ({name, type: 'endorser'})),
    ];
    const nodeIdByName = {};
    for (let i = 0; i < nodes.length; i++) {
        nodeIdByName[nodes[i].name] = i;
    }
    for (const link of links) {
        link.source = nodeIdByName[link.source];
        link.target = nodeIdByName[link.target];
    }

    /*
    const sharedEndorsements = {};
    for (const [group, endorseeSet] of Object.entries(endorsementsByGroup)) {
        nodes.push({id: group, type: 'endorser'});
        const endorsees = [...endorseeSet].sort();
        for (let i = 0; i < endorsees.length - 1; i++) {
            for (let j = i + 1; j < endorsees.length; j++) {
                if (!sharedEndorsements[endorsees[i]]) {
                    sharedEndorsements[endorsees[i]] = {};
                }
                if (!sharedEndorsements[endorsees[i]][endorsees[j]]) {
                    sharedEndorsements[endorsees[i]][endorsees[j]] = [];
                }
                sharedEndorsements[endorsees[i]][endorsees[j]].push(group);
            }
        }
    }
    const links = [];
    for (const {id: c1} of nodes) {
        for (const [c2, groups] of Object.entries(sharedEndorsements[c1] || {})) {
            links.push({
                source: c1,
                target: c2,
                count: groups.length,
                groups,
            });
        }
    }
     */
    process.stdout.write(JSON.stringify({nodes, links}, null, 2));
}
