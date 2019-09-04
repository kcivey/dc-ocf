#!/usr/bin/env node

const fs = require('fs');
const moment = require('moment');
const argv = require('yargs')
    .options({
        available: {
            type: 'boolean',
            describe: 'make JSON showing what is available',
        },
        office: {
            type: 'string',
            describe: 'include only offices that match string',
            required: true,
            requiredArg: true,
        },
        pretty: {
            type: 'boolean',
            describe: 'pretty-print the JSON',
        },
    })
    .strict(true)
    .argv;
const db = require('../lib/db');

main()
    .catch(console.trace)
    .finally(() => db.close());

async function main() {
    const codeToHead = {
        candidate_short_name: 'Candidate',
        contributions: 'Contributions',
        contributors: 'All contributors',
        dc_contributors: 'DC contributors',
        ward_contributors: 'Ward contributors',
        // dc_ind_contributors: 'DC ind. contributors',
        // ward_ind_contributors: 'Ward ind. contributors',
        amount: 'All $',
        dc_amount: 'DC $',
        ward_amount: 'Ward $',
        candidate_amount: 'Candidate/Family $',
        fair_elections_total: 'Projected $ w/ Fair Elections',
        // ind_amount: 'Individual $',
        // dc_ind_amount: 'DC individual $',
        // ward_ind_amount: 'Ward individual $',
        dc_percent: 'DC % of $',
        ward_percent: 'Ward % of $',
        candidate_percent: 'Candidate/Family % of $',
        mean: 'Mean $',
        median: 'Median $',
    };
    const office = await db.getMatchingOffice(argv.office);
    const m = office.match(/Ward (\d)/);
    const ward = m ? +m[1] : null;
    if (!ward) {
        for (const key of Object.keys(codeToHead)) {
            if (/^ward_/.test(key)) {
                delete codeToHead[key];
            }
        }
    }
    const columnHeads = Object.values(codeToHead);
    const columnCodes = Object.keys(codeToHead);
    const filters = {office: argv.office};
    const stats = await db.getContributionStats({filters, ward});
    const minMax = {};
    for (const code of columnCodes) {
        if (code !== 'candidate_short_name') {
            const values = stats.map(row => row[code]);
            minMax[code] = {
                min: Math.min(...values),
                max: Math.max(...values),
            };
        }
    }
    const tableData = stats.map(formatRow);
    const data = {
        office,
        ward,
        points: await db.getDcContributionsWithPositions(filters),
        stats: {columnHeads, tableData},
        dateData: await getDateData(filters, ward),
        placeData: await getPlaceData(argv.office, ward),
    };
    const officeCode = hyphenize(office);
    const outputFile = `${__dirname}/ocf-2020-${officeCode}.json`;
    fs.writeFileSync(outputFile, JSON.stringify(data, null, argv.pretty ? 2 : 0));
    if (argv.available) {
        const outputFile = __dirname + '/available.json';
        const availableContests = await db.getAvailableContests();
        fs.writeFileSync(outputFile, JSON.stringify(availableContests, null, argv.pretty ? 2 : 0));
    }

    function formatRow(row) {
        return columnCodes.map(function (code) {
            const value = row[code];
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
        });
    }
}

async function getDateData(baseFilters, ward) {
    const lastReportDates = await db.getLastReportDates(baseFilters.office);
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
        contributors[key] = [];
        const filters = {...baseFilters, ...addedFilters};
        const rows = await db.getContributionsByDate(filters);
        const data = {};
        for (const row of rows) {
            if (!data[row.receipt_date]) {
                data[row.receipt_date] = {};
            }
            data[row.receipt_date][row.candidate_short_name] = row.contributors;
        }
        const runningTotals = {};
        let i = 0;
        for (const candidate of Object.keys(lastReportDates)) {
            contributors[key][i] = [candidate];
            runningTotals[candidate] = 0;
            i++;
        }
        if (key === 'all') {
            start = rows[0].receipt_date;
            end = rows[rows.length - 1].receipt_date;
        }
        const cursorDate = moment(start);
        const endDate = moment(end);
        while (cursorDate <= endDate) {
            const isoDate = cursorDate.format('YYYY-MM-DD');
            let i = 0;
            for (const [candidate, lastReportDate] of Object.entries(lastReportDates)) {
                if (isoDate <= lastReportDate) {
                    runningTotals[candidate] += +(data[isoDate] && data[isoDate][candidate]) || 0;
                    contributors[key][i].push(runningTotals[candidate]);
                    i++;
                }
            }
            cursorDate.add(1, 'day');
        }
    }
    return {start, end, contributors};
}

async function getPlaceData(office, ward = null) {
    const candidates = await db.getCandidatesForOffice(office);
    const allStates = await db.getContributorPlaces(office);
    const allWards = await db.getContributorPlaces(office, true);
    const placeData = [];
    for (const candidate of candidates) {
        const contributorsByState = await db.getContributorsByPlace(candidate);
        const stateColumns = makePlaceContributorColumns(allStates, contributorsByState);
        const contributorStates = stateColumns.map(item => item[0]);
        const stateColors = makeColors(allStates, contributorStates, 'DC');
        const contributorsByWard = await db.getContributorsByPlace(candidate, true);
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

function hyphenize(s) {
    return s.replace(/([a-z])(?=[A-Z])/g, '$1-')
        .toLowerCase()
        .replace(/[^a-z\d]+/g, '-')
        .replace(/^-|-$/g, '');
}
