#!/usr/bin/env node

const vsprintf = require('sprintf-js').vsprintf;
const argv = require('yargs')
    .options({
        bins: {
            type: 'boolean',
            describe: 'show columns for ranges of contribution amounts',
        },
        csv: {
            type: 'boolean',
            describe: 'CSV output',
        },
        html: {
            type: 'boolean',
            describe: 'HTML output',
        },
        office: {
            type: 'string',
            describe: 'include only offices that match string',
        },
        since: {
            type: 'string',
            describe: 'donations since date',
        },
        threshold: {
            type: 'number',
            describe: 'report only committees receiving at least threshold',
            default: 10000,
        },
    })
    .strict(true)
    .argv;
const db = require('./lib/db');
const bins = argv.bins && [25, 50, 100, 250, 500, 999.99];
const filters = {since: argv.since, office: argv.office};

db.getContributionStats({filters, bins})
    .then(printReport)
    .catch(console.trace)
    .finally(() => db.close());

function printReport(rows) {
    const percentDecimals = 1;
    const percentLength = 4 + percentDecimals;
    let prevOffice = '';
    const {header, format, officeFormat, footer} = argv.html ? getHtmlFormat() :
        argv.csv ? getCsvFormat() : getTextFormat(percentLength);
    console.log(header);
    for (const c of rows) {
        if (c.amount < argv.threshold) {
            continue;
        }
        const values = [
            c.contributions,
            c.contributors,
            c.ind_dc_contributors,
            c.amount,
            c.mean,
            c.median,
            c.ind_percent,
            c.dc_percent,
            c.ind_dc_percent,
        ].map(numberFormat);
        values.unshift(c.candidate_short_name);
        if (argv.bins) {
            for (let i = 0; i < bins.length; i++) {
                values.push((100 * c.bin_amounts[i] / c.amount).toFixed(percentDecimals));
            }
            values.push((100 * c.bin_amounts[bins.length] / c.amount).toFixed(percentDecimals));
        }
        if (c.office !== prevOffice && !argv.csv) {
            console.log(vsprintf(officeFormat, [c.office.toUpperCase()]));
        }
        console.log(vsprintf(format, values));
        prevOffice = c.office;
    }
    console.log(footer);
    // printCrossCandidateContributions();
}

function getHtmlFormat() {
    let header = '<style>td,th { white-space: nowrap; padding: 2px 4px; } .number { text-align: right; }</style>' +
        '<table>\n<tr>' +
        '<th>Candidate</th>' +
        '<th class="number">Contri-<br>butions</th>' +
        '<th class="number">Contrib-<br>utors</th>' +
        '<th class="number">DC Ind<br>Contbr</th>' +
        '<th class="number">Amount</th>' +
        '<th class="number">Mean</th>' +
        '<th class="number">Median</th>' +
        '<th class="number">%Ind</th>' +
        '<th class="number">%DC</th>' +
        '<th class="number">%DCInd</th>';
    let format = '<tr><td style="text-indent: 1em">%s</td>' +
        '<td class="number">%s</td>' +
        '<td class="number">%s</td>' +
        '<td class="number">%s</td>' +
        '<td class="number">$%s</td>' +
        '<td class="number">$%s</td>' +
        '<td class="number">$%s</td>' +
        '<td class="number">%s</td>' +
        '<td class="number">%s</td>' +
        '<td class="number">%s</td>';
    if (argv.bins) {
        let start = '0';
        for (const end of bins) {
            header += '<th class="number">' + start + '-<br>' + end + '</th>';
            format += '<td class="number">%s</td>';
            start = (end + 0.01).toFixed(2);
        }
        header += '<th  class="number">' + start + '+</th>';
        format += '<td class="number">%s</td>';
    }
    header += '</tr>';
    format += '</tr>';
    let colspan = 10;
    if (argv.bins) {
        colspan += bins.length + 1;
    }
    const officeFormat = `<tr><td colspan="${colspan}">%s</td></tr>`;
    const footer = '</table>\n<p>' +
        'DC Ind Contbr is the number of individual contributors (as opposed to PACs, corporations, LLCs, etc.) ' +
        'who live in DC (theoretically the number of DC voters who contributed). %Ind is the % of the money that ' +
        'comes from individuals. %DC is the % of the money that comes from DC addresses. %DCInd is % of the money ' +
        'that comes from individuals with DC addresses (theoretically the  % of the money that comes from DC voters.' +
        '</p>';
    return {header, format, officeFormat, footer};
}

function getCsvFormat() {
    let header = [
        'Candidate',
        'Contributions',
        'Contributors',
        'DCIndContbr',
        'Amount',
        'Mean',
        'Median',
        '%Ind',
        '%DC',
        '%DCInd',
    ].join('\t');
    let columnCount = 10;
    if (argv.bins) {
        columnCount += bins.length + 1;
    }
    if (argv.bins) {
        let start = '0';
        for (const end of bins) {
            header += '\t' + start + '-' + end;
            start = (end + 0.01).toFixed(2);
        }
        header += '\t' + start + '+';
    }
    const format = Array(columnCount).fill('%s').join('\t');
    const officeFormat = '%s';
    const footer = '';
    return {header, format, officeFormat, footer};
}

function getTextFormat(percentLength) {
    let header = 'Candidate               Contributions  Contributors  DCIndContbr    ' +
        'Amount   Mean  Median  %Ind %DC %DCInd';
    let format = '%-22s %14s %13s %12s %9s  %5s  %6s  %4s %3s %6s';
    if (argv.bins) {
        let start = '0';
        for (const end of bins) {
            const columnHead = start + '-' + end;
            header += '  ' + columnHead.padStart(percentLength);
            format += '  %' + Math.max(columnHead.length, percentLength) + 's';
            start = (end + 0.01).toFixed(2);
        }
        header += '  ' + start + '+';
        format += '  %' + (start.length + 1) + 's';
    }
    const officeFormat = '%s';
    const footer = '\n' +
        'DC Ind Contbr is the number of individual contributors (as opposed to PACs, corporations, LLCs, etc.)\n' +
        'who live in DC (theoretically the number of DC voters who contributed). %Ind is the % of the money that\n' +
        'comes from individuals. %DC is the % of the money that comes from DC addresses. %DCInd is % of the money\n' +
        'that comes from individuals with DC addresses (theoretically the  % of the money that comes from DC voters.\n';
    return {header, format, officeFormat, footer};
}

function numberFormat(x) {
    return Math.round(x).toLocaleString();
}

/*
function printCrossCandidateContributions() {
    const makeContributorQueryFn = function (alias) {
        return function () {
            this.select('contributions.committee_name', 'candidate_name', 'normalized')
                .sum('amount as subtotal')
                .from('contributions')
                .innerJoin('committees', 'committees.committee_name', 'contributions.committee_name')
                .having('subtotal', '>=', 100)
                .groupBy('contributions.committee_name', 'candidate_name', 'normalized')
                .as(alias);
        };
    };
    return db.select('c1.candidate_name as candidate1', 'c2.candidate_name as candidate2')
        .sum('c1.subtotal as subtotal1')
        .sum('c2.subtotal as subtotal2')
        .count('* as contributors')
        .from(makeContributorQueryFn('c1'))
        .innerJoin(makeContributorQueryFn('c2'), 'c1.normalized', 'c2.normalized')
        .groupBy('candidate1', 'candidate2')
        .orderBy('candidate1')
        .orderBy('subtotal1', 'desc')
        .then(function (rows) {
            let prev = '';
            let total;
            for (const row of rows) {
                if (prev !== row.candidate1) {
                    console.log(row.candidate1);
                    total = row.subtotal1;
                    prev = row.candidate1;
                }
                // else {
                console.log(vsprintf('  %20s %5d %8s %5.2f%%', [
                    row.candidate2,
                    row.contributors,
                    '$' + Math.round(row.subtotal1).toLocaleString(),
                    100 * (row.subtotal1 / total),
                    row.subtotal2,
                ]));
                // }
            }
            process.exit();
        });
}
*/
