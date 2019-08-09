#!/usr/bin/env node

const vsprintf = require('sprintf-js').vsprintf;
const stats = require('stats-lite');
const _ = require('underscore');
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
const data = {};
const bins = [25, 50, 100, 250, 500, 999.99];
const filters = argv.since ? {since: argv.since} : {};

db.getContributionInfo(filters)
    .then(function (rows) {
        rows.forEach(function (row) {
            // console.log(row.committee_name);
            row.amountList = [];
            if (argv.bins) {
                row.binAmounts = bins.map(() => 0).concat([0]);
            }
            row.dc_ind_contributors = 0;
            data[row.committee_name] = row;
        });
        getStats();
    });

function getStats() {
    db.getContributorTypes(filters)
        .then(() => db.getContributionAmountsByType(filters))
        .then(function (amounts) {
            for (const [committee, obj] of Object.entries(amounts)) {
                data[committee].amountByType = obj;
            }
        })
        .then(() => db.getContributionSubtotals(filters))
        .then(function (rows) {
            const officeRegex = argv.office ? new RegExp(argv.office, 'i') : null;
            let prevOffice = '';
            const percentDecimals = 1;
            const percentLength = 4 + percentDecimals;
            const {headers, format, officeFormat} = argv.html ? getHtmlFormat() :
                argv.csv ? getCsvFormat() : getTextFormat(percentLength);
            console.log(headers);
            rows.forEach(function (row) {
                data[row.committee_name].amountList.push(row.subtotal);
                if (argv.bins) {
                    let i = 0;
                    for (i = 0; i < bins.length; i++) {
                        if (row.subtotal <= bins[i]) {
                            data[row.committee_name].binAmounts[i] += row.subtotal;
                            break;
                        }
                    }
                    if (i >= bins.length) {
                        data[row.committee_name].binAmounts[i] += row.subtotal;
                    }
                }
                if (row.state === 'DC') {
                    data[row.committee_name].dc_ind_contributors++;
                }
            });
            _.each(data, function (c) {
                const values = [
                    c.candidate_name,
                    numberFormat(c.contributions),
                    numberFormat(c.amountList.length),
                    numberFormat(c.dc_ind_contributors),
                    numberFormat(c.amount),
                ];
                if (c.amount < argv.threshold || (officeRegex && !officeRegex.test(c.office))) {
                    return;
                }
                c.amountList = c.amountList.sort((a, b) => a - b);
                values.push(
                    numberFormat(stats.mean(c.amountList)),
                    numberFormat(stats.median(c.amountList)),
                    numberFormat(100 * c.ind_amount / c.amount),
                    numberFormat(100 * c.dc_amount / c.amount),
                    numberFormat(100 * c.dc_ind_amount / c.amount)
                    // c.amountList[0],
                    // c.amountList[c.amountList.length - 1]
                );
                if (argv.bins) {
                    bins.forEach(function (end, i) {
                        values.push((100 * c.binAmounts[i] / c.amount).toFixed(percentDecimals));
                    });
                    values.push((100 * c.binAmounts[bins.length] / c.amount).toFixed(percentDecimals));
                }
                if (c.office !== prevOffice && !argv.csv) {
                    console.log(vsprintf(officeFormat, [c.office.toUpperCase()]));
                }
                console.log(vsprintf(format, values));
                prevOffice = c.office;
            });
            if (argv.html) {
                console.log('</table>\n');
            }
            // printCrossCandidateContributions();
            process.exit();
        });
}

function getHtmlFormat() {
    let headers = '<table>\n<tr>' +
        '<th>Candidate</th>' +
        '<th style="text-align: right">Contri-<br>butions</th>' +
        '<th style="text-align: right">Contrib-<br>utors</th>' +
        '<th style="text-align: right">DC Ind<br>Contbr</th>' +
        '<th style="text-align: right">Amount</th>' +
        '<th style="text-align: right">Mean</th>' +
        '<th style="text-align: right">Median</th>' +
        '<th style="text-align: right">%Ind</th>' +
        '<th style="text-align: right">%DC</th>' +
        '<th style="text-align: right">%DCInd</th>';
    let format = '<tr><td style="text-indent: 1em">%s</td>' +
        '<td style="text-align: right">%s</td>' +
        '<td style="text-align: right; white-space: nowrap">%s</td>' +
        '<td style="text-align: right; white-space: nowrap">%s</td>' +
        '<td style="text-align: right">$%s</td>' +
        '<td style="text-align: right">$%s</td>' +
        '<td style="text-align: right">$%s</td>' +
        '<td style="text-align: right">%s</td>' +
        '<td style="text-align: right">%s</td>' +
        '<td style="text-align: right">%s</td>';
    if (argv.bins) {
        let start = '0';
        bins.forEach(function (end) {
            headers += '<th  style="text-align: right">' + start + '-<br>' + end + '</th>';
            format += '<td style="text-align: right">%s</td>';
            start = (end + 0.01).toFixed(2);
        });
        headers += '<th  style="text-align: right">' + start + '+</th>';
        format += '<td style="text-align: right">%s</td>';
    }
    headers += '</tr>';
    format += '</tr>';
    let colspan = 10;
    if (argv.bins) {
        colspan += bins.length + 1;
    }
    const officeFormat = `<tr><td colspan="${colspan}">%s</td></tr>`;
    return {headers, format, officeFormat};
}

function getCsvFormat() {
    let headers = [
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
        bins.forEach(function (end) {
            headers += '\t' + start + '-' + end;
            start = (end + 0.01).toFixed(2);
        });
        headers += '\t' + start + '+';
    }
    const format = Array(columnCount).fill('%s').join('\t');
    const officeFormat = '%s';
    return {headers, format, officeFormat};
}

function getTextFormat(percentLength) {
    let headers = 'Candidate               Contributions  Contributors  DCIndContbr    ' +
        'Amount   Mean  Median  %Ind %DC %DCInd';
    let format = '%-22s %14s %13s %12s %9s  %5s  %6s  %4s %3s %6s';
    if (argv.bins) {
        let start = '0';
        bins.forEach(function (end) {
            const header = start + '-' + end;
            headers += '  ' + header.padStart(percentLength);
            format += '  %' + Math.max(header.length, percentLength) + 's';
            start = (end + 0.01).toFixed(2);
        });
        headers += '  ' + start + '+';
        format += '  %' + (start.length + 1) + 's';
    }
    const officeFormat = '%s';
    return {headers, format, officeFormat};
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
            rows.forEach(function (row) {
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
            });
            process.exit();
        });
}
*/
