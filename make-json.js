#!/usr/bin/env node
'use strict';

const fs = require('fs');
const moment = require('moment');
const argv = require('yargs')
    .options({
        office: {
            type: 'string',
            describe: 'include only offices that match string',
            default: '',
            requiredArg: true,
        },
        pretty: {
            type: 'boolean',
            describe: 'pretty-print the JSON',
        },
        threshold: {
            type: 'number',
            describe: 'include only committees receiving at least threshold',
            default: 0,
            requiredArg: true,
        },
        year: {
            type: 'number',
            describe: 'election year',
            default: 0,
            defaultDescription: 'all available',
            requiredArg: true,
        },
    })
    .strict(true)
    .argv;
const db = require('./lib/db');
const {hyphenize} = require('./lib/util');
const outputDir = __dirname + '/src';

main()
    .catch(function (err) {
        console.trace(err);
        process.exit(1);
    })
    .finally(() => db.close());

async function main() {
    let offices;
    if (argv.office) {
        offices = [await db.getMatchingOffice(argv.office, argv.year)];
    }
    else {
        offices = await db.getOfficesForReport(argv.threshold, argv.year);
    }
    for (const office of offices) {
        await processOffice(office);
    }
    const outputFile = outputDir + '/available.json';
    const availableContests = await db.getAvailableContests(argv.threshold, argv.year);
    console.warn(`Writing ${outputFile}`);
    fs.writeFileSync(outputFile, JSON.stringify(availableContests, null, argv.pretty ? 2 : 0));
}

async function processOffice(office) {
    const rowDefs = {
        candidate_short_name: {
            head: '',
            title: '',
        },
        contributions: {
            head: 'Contributions',
            title: 'Will be higher than the number of contributors if some people gave more than once',
        },
        mean: {
            head: 'Mean $',
            title: 'Mean contribution (combining all contributions for each contributor)',
        },
        median: {
            head: 'Median $',
            title: 'Median contribution (combining all contributions for each contributor)',
        },
        contributors: {
            head: 'All contributors',
            title: 'Number of entities who gave',
        },
        dc_contributors: {
            head: 'DC contributors',
            title: 'Contributors who live in DC',
        },
        ward_contributors: {
            head: 'Ward contributors',
            title: 'Contributors who live in the ward',
        },
        ind_contributors: {
            head: 'Individual contributors',
            title: 'Number of individuals who gave',
        },
        ind_dc_contributors: {
            head: 'DC individual contributors',
            title: 'Contributors who live in DC and are individuals',
        },
        ind_ward_contributors: {
            head: 'Ward individual contributors',
            title: 'Contributors who live in the ward and are individuals',
        },
        candidate_contributors: {
            head: 'Candidate/family contributors',
            title: 'Contributors who are the candidate or (under Fair Elections) family',
        },
        amount: {
            head: 'All $',
            title: 'Total amount contributed',
        },
        dc_amount: {
            head: 'DC $',
            title: 'Amount contributed from DC',
        },
        ward_amount: {
            head: 'Ward $',
            title: 'Amount contributed from the ward',
        },
        ind_amount: {
            head: 'Individual $',
            title: 'Total amount contributed by individuals',
        },
        ind_dc_amount: {
            head: 'DC individual $',
            title: 'Amount contributed by individuals in DC',
        },
        ind_ward_amount: {
            head: 'Ward individual $',
            title: 'Amount contributed by individuals in the ward',
        },
        candidate_amount: {
            head: 'Candidate/family $',
            title: 'Amount contributed by the candidate or (under Fair Elections) family',
        },
        dc_percent: {
            head: 'DC % of $',
            title: 'Percent of the total amount that came from DC',
        },
        ward_percent: {
            head: 'Ward % of $',
            title: 'Percent of the total amount that came from the ward',
        },
        ind_percent: {
            head: 'Individual % of $',
            title: 'Percent of the total amount that came from individuals',
        },
        ind_dc_percent: {
            head: 'DC individual % of $',
            title: 'Percent of the total amount that came from individuals in DC',
        },
        ind_ward_percent: {
            head: 'Ward individual % of $',
            title: 'Percent of the total amount that came from individuals in the ward',
        },
        candidate_percent: {
            head: 'Candidate/family % of $',
            title: 'Percent of the total amount that came from the candidate or (under Fair Elections) family',
        },
        amount_to_refund: {
            head: '$ to Refund',
            title: 'Amount that still needs to be refunded (from contributions higher than the limit)',
        },
        fair_elections_addition: {
            head: 'Projected $ from Fair Elections',
            title: 'Amount of public money a Fair Elections candidate could expect based on current contributions',
        },
        fair_elections_total: {
            head: 'Projected total $',
            title: 'Total amount minus future refunds plus projected Fair Elections money',
        },
    };
    const m = office.match(/Ward (\d)/);
    const ward = m ? +m[1] : null;
    if (!ward) {
        for (const key of Object.keys(rowDefs)) {
            if (/^(?:ind_)?ward_/.test(key)) {
                delete rowDefs[key];
            }
        }
    }
    const allFairElections = await db.areAllCandidatesFairElections(office, argv.year);
    if (allFairElections) {
        // Rows for individuals are redundant if all candidates can take money only from individuals
        for (const key of Object.keys(rowDefs)) {
            if (/^ind_/.test(key)) {
                delete rowDefs[key];
            }
        }
    }
    const candidates = await db.getCandidatesForOffice(office, argv.year, argv.threshold);
    const filters = {office, candidates, year: argv.year};
    const stats = (await db.getContributionStats({filters}));
    const columnHeads = [''].concat(stats.map(row => row.candidate_short_name));
    const rowCodes = Object.keys(rowDefs).slice(1); // skip candidate name
    const minMax = {};
    for (const code of rowCodes) {
        const values = stats.map(row => row[code]);
        minMax[code] = {
            min: Math.min(...values),
            max: Math.max(...values),
        };
    }
    const tableData = rowCodes.map(code => [rowDefs[code]]);
    for (const row of stats) {
        rowCodes.forEach((code, i) => tableData[i].push(formatCell(row[code], code)));
    }
    const officeCode = hyphenize(office);
    const data = {
        updated: '', // new Date().toLocaleDateString('en-US', {year: 'numeric', day: 'numeric', month: 'long'}),
        office,
        ward,
        allFairElections,
        extras: getExtras(officeCode),
        points: await db.getDcContributionsWithPositions(filters),
        stats: {columnHeads, tableData},
        shared: await getSharedData(filters),
        dateData: await getDateData(filters, ward),
        placeData: await getPlaceData(filters, ward),
    };
    const outputFile = `${outputDir}/ocf-2020-${officeCode}.json`;
    let oldData = null;
    try {
        oldData = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
        oldData.updated = '';
    }
    catch (err) {
        // no data if file missing
    }
    if (JSON.stringify(data) === JSON.stringify(oldData)) {
        console.warn('Data is unchanged -- not writing');
        return;
    }
    data.updated = new Date().toLocaleDateString('en-US', {year: 'numeric', day: 'numeric', month: 'long'});
    console.warn(`Writing ${outputFile}`);
    fs.writeFileSync(outputFile, JSON.stringify(data, null, argv.pretty ? 2 : 0));

    function formatCell(value, code) {
        if (typeof value !== 'number') {
            return value;
        }
        let className = 'text-right';
        for (const extreme of ['min', 'max']) {
            if (value === minMax[code][extreme]) {
                className += ' ' + extreme;
            }
        }
        className = className.replace(' min max', ''); // don't use class if all values are the same
        return {
            value: Math.round(value).toLocaleString(),
            class: className,
        };
    }
}

async function getSharedData({candidates, year}) {
    const threshold = 5;
    const places = 5;
    const data = {};
    for (const candidate of candidates) {
        const rows = await db.getCommitteesWithTopSharedContributors(candidate, 2020);
        if (!rows[0] || rows[0].count < threshold) {
            continue;
        }
        const total = await db.getContributorCount(candidate, year);
        let prevCount = 1;
        let i = 0;
        for (const row of rows) {
            i++;
            if (i > places || row.contributors < threshold) {
                break;
            }
            if (!data[candidate]) {
                data[candidate] = [];
            }
            data[candidate].push([
                prevCount === row.contributors ? '<i>tie</i>' : i,
                row.candidate_name,
                row.election_year,
                row.office,
                row.contributors,
                (100 * row.contributors / total).toFixed(1),
            ]);
            prevCount = row.contributors;
        }
    }
    return Object.keys(data).length ? data : null;
}

async function getDateData(baseFilters, ward) {
    const lastDeadlines = await db.getLastDeadlines(baseFilters.office, baseFilters.year);
    const sets = {
        all: {},
        dc: {state: 'DC'},
    };
    if (ward) {
        sets.ward = {ward};
    }
    const contributors = {};
    let start;
    let end;
    for (const [key, addedFilters] of Object.entries(sets)) {
        const columns = [];
        const filters = {...baseFilters, ...addedFilters};
        const rows = await db.getContributorsByDate(filters);
        const data = {};
        for (const row of rows) {
            if (!data[row.receipt_date]) {
                data[row.receipt_date] = {};
            }
            data[row.receipt_date][row.candidate_short_name] = row.contributors;
        }
        const runningTotals = {};
        let i = 0;
        for (const candidate of Object.keys(lastDeadlines)) {
            columns[i] = [candidate];
            runningTotals[candidate] = 0;
            i++;
        }
        if (key === 'all') {
            start = rows[0].receipt_date;
            end = rows[rows.length - 1].receipt_date;
        }
        const cursorDate = moment(start);
        const endDate = moment(end);
        while (cursorDate <= endDate) { // eslint-disable-line no-unmodified-loop-condition
            const isoDate = cursorDate.format('YYYY-MM-DD');
            let i = 0;
            for (const [candidate, lastDeadline] of Object.entries(lastDeadlines)) {
                if (isoDate <= lastDeadline) {
                    runningTotals[candidate] += +(data[isoDate] && data[isoDate][candidate]) || 0;
                    columns[i].push(runningTotals[candidate]);
                }
                i++;
            }
            cursorDate.add(1, 'day');
        }
        contributors[key] = columns;
    }
    return {start, end, contributors};
}

async function getPlaceData(filters, ward = null) {
    const office = filters.office;
    const candidates = filters.candidates;
    const year = filters.year;
    const allStates = await db.getContributorPlaces(office, year);
    const allWards = await db.getContributorPlaces(office, year, true);
    const placeData = [];
    for (const candidate of candidates) {
        const contributorsByState = await db.getContributorsByPlace(candidate, year);
        const stateColumns = makePlaceContributorColumns(allStates, contributorsByState);
        const contributorStates = stateColumns.map(item => item[0]);
        const stateColors = makeColors(allStates, contributorStates, 'DC');
        const contributorsByWard = await db.getContributorsByPlace(candidate, year, true);
        const wardColumns = makePlaceContributorColumns(allWards, contributorsByWard);
        const contributorWards = wardColumns.map(item => item[0]);
        const wardColors = makeColors(allWards, contributorWards, ward);
        placeData.push({
            candidate,
            code: hyphenize(candidate),
            state: {
                columns: stateColumns,
                colors: stateColors,
            },
            ward: {
                columns: wardColumns,
                colors: wardColors,
            },
        });
    }
    return placeData;
}

function makePlaceContributorColumns(places, contributorsByPlace) {
    const total = Object.values(contributorsByPlace)
        .reduce((a, b) => a + b, 0);
    const threshold = total * 0.02;
    const columns = [];
    let otherContributors = 0;
    const otherPlaces = [];
    for (const place of places) {
        const contributors = contributorsByPlace[place];
        if (!contributors) {
            continue;
        }
        if (contributors >= threshold) {
            columns.push([place, contributors]);
        }
        else {
            otherContributors += contributors;
            otherPlaces.push(place);
            columns.push([place, 0]);
        }
    }
    if (otherPlaces.length === 1) {
        // If there's only 1 place counted as 'Other', count it as itself
        const place = otherPlaces[0];
        const index = places.indexOf(place);
        columns[index] = [place, otherContributors];
        otherContributors = 0;
    }
    columns.push(['Other', otherContributors]);
    return columns.filter(item => item[1] > 0);
}

function makeColors(allPlaces, contributorPlaces, primaryPlace) {
    const primaryColor = '#ff0000';
    const colorSeries = [ // taken from d3.schemeCategory10 and tableau10, with red one moved to 10th position
        '#1f77b4',
        '#ff7f0e',
        '#2ca02c',
        '#9467bd',
        '#8c564b',
        '#e377c2',
        '#7f7f7f',
        '#bcbd22',
        '#17becf',
        '#d62728',
        '#4e79a7',
        // '#f28e2c', too similar to #ff7f0e
        '#e15759',
        '#76b7b2',
        '#59a14f',
        '#edc949',
        '#af7aa1',
        '#ff9da7',
        '#9c755f',
        '#bab0ab',
    ];
    const colors = {};
    let i = 0;
    for (const place of allPlaces) {
        if (place === primaryPlace) {
            colors[place] = primaryColor;
        }
        else {
            colors[place] = colorSeries[i];
            i++;
            if (i >= colorSeries.length) {
                i = 0;
            }
        }
        if (!contributorPlaces.includes(place)) {
            delete colors[place];
        }
    }
    if (contributorPlaces.includes('Other')) {
        colors['Other'] = '#dddddd';
    }
    return colors;
}

function getExtras(officeCode) {
    const inputFile = `${outputDir}/ocf-2020-${officeCode}.txt`;
    let text;
    try {
        text = fs.readFileSync(inputFile, 'utf8').trim();
    }
    catch (err) {
        text = '';
    }
    const extras = {};
    if (text) {
        let key;
        for (const line of text.split('\n')) {
            if (/^=([\w-]+)\s*$/.test(line)) {
                key = line.substr(1).trim();
                extras[key] = '';
            }
            else if (key) {
                extras[key] += '\n' + line;
            }
            else {
                throw new Error(`Missing key in ${inputFile}`);
            }
        }
        for (const key of Object.keys(extras)) {
            extras[key] = '<p>' +
                extras[key].trim().replace(/\s*\n\s*\n\s*/g, '</p>\n<p>') +
                '</p>';
        }
    }
    return extras;
}
