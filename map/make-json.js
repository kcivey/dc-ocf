#!/usr/bin/env node

const moment = require('moment');
const {dasherize} = require('underscore.string');
const argv = require('yargs')
    .options({
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
        contributors: 'Contributors',
        dc_contributors: 'DC contributors',
        ward_contributors: 'Ward contributors',
        // dc_ind_contributors: 'DC ind. contributors',
        // ward_ind_contributors: 'Ward ind. contributors',
        amount: 'Total $',
        dc_amount: 'DC $',
        ward_amount: 'Ward $',
        // ind_amount: 'Individual $',
        // dc_ind_amount: 'DC individual $',
        // ward_ind_amount: 'Ward individual $',
        dc_percent: 'DC % of $',
        ward_percent: 'Ward % of $',
        mean: 'Mean contribution $',
        median: 'Median contribution $',
    };
    const office = await db.getMatchingOffice(argv.office);
    const m = office.match(/Ward (\d)/);
    const ward = m ? +m[1] : null;
    if (!ward) {
        for (const key in Object.keys(codeToHead)) {
            if (/^ward_/.test(key)) {
                delete codeToHead[key];
            }
        }
    }
    const columnHeads = Object.values(codeToHead);
    const filters = {office: argv.office};
    const stats = await db.getContributionStats({filters, ward});
    const tableData = stats
        .map(function (obj) {
            return Object.keys(codeToHead)
                .filter(k => obj.hasOwnProperty(k))
                .map(k => obj[k])
                .map(formatNumber);
        });
    const data = {
        points: await db.getDcContributionsWithPositions(filters),
        stats: {columnHeads, tableData},
        dateData: await getDateData(filters, ward),
        placeData: await getPlaceData(argv.office),
    };
    process.stdout.write(JSON.stringify(data, null, argv.pretty ? 2 : 0));
}

function formatNumber(value) {
    return typeof value === 'number' ?
        {value: Math.round(value).toLocaleString(), class: 'text-right'} :
        value;
}

async function getDateData(baseFilters, ward) {
    const candidates = await db.getCandidatesForOffice(baseFilters.office);
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
        for (const candidate of candidates) {
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
            for (const candidate of candidates) {
                runningTotals[candidate] += +(data[isoDate] && data[isoDate][candidate]) || 0;
                contributors[key][i].push(runningTotals[candidate]);
                i++;
            }
            cursorDate.add(1, 'day');
        }
    }
    return {start, end, contributors};
}

async function getPlaceData(office) {
    const candidates = await db.getCandidatesForOffice(office);
    const placeData = [];
    const thresholdFraction = 0.01;
    for (const candidate of candidates) {
        const contributorsByPlace = await db.getContributorsByPlace(candidate);
        const total = Object.values(contributorsByPlace)
            .reduce((a, b) => a + b);
        const threshold = total * thresholdFraction;
        const columns = [];
        let other = 0;
        const otherPlaces = [];
        for (const [place, contributors] of Object.entries(contributorsByPlace)) {
            if (contributors >= threshold) {
                columns.push([place, contributors]);
            }
            else {
                other += contributors;
                otherPlaces.push(place);
            }
        }
        if (other) {
            const place = otherPlaces.length === 1 ? otherPlaces[0] : 'Other';
            columns.unshift([place, other]);
        }
        placeData.push({
            candidate,
            code: dasherize(candidate.toLowerCase()),
            columns,
        });
    }
    return placeData;
}
