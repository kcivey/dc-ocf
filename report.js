#!/usr/bin/env node

const vsprintf = require('sprintf-js').vsprintf;
const stats = require('stats-lite');
const _ = require('underscore');
const program = require('commander');
const db = require('./db');
const data = {};
const bins = [25, 50, 100, 250, 500, 999.99];
let contributorTypes;

program.option('--html', 'HTML output')
    .option('--csv', 'CSV output')
    .option('--since <date>', 'Donations since date')
    .option('--office <office>', 'Include only offices that match string')
    .option('--threshold <threshold>', 'Report only committees receiving at least threshold [10000]', 10000)
    .parse(process.argv);

let query = db
    .select(
        'office',
        'contributions.committee_name',
        'candidate_name',
        db.raw("sum(case when state = 'DC' then amount else 0 end) as dc_amount"),
        db.raw("sum(case when contributor_type in ('Individual', 'Candidate') then amount else 0 end) as ind_amount"),
        db.raw("sum(case when state = 'DC' and contributor_type in ('Individual', 'Candidate') " +
            'then amount else 0 end) as dc_ind_amount')
    )
    .count('* as contributions')
    .sum('amount as amount')
    .from('contributions')
    .innerJoin('committees', 'contributions.committee_name', 'committees.committee_name')
    .where(1, 1);
addFilters(query);
query.groupBy('office', 'contributions.committee_name', 'candidate_name')
    .orderBy('office')
    .orderBy('candidate_name')
    .then(function (rows) {
        rows.forEach(function (row) {
            // console.log(row.committee_name);
            row.amountList = [];
            row.amountByType = {};
            row.binAmounts = bins.map(() => 0).concat([0]);
            row.dc_ind_contributors = 0;
            data[row.committee_name] = row;
        });
        getStats();
    });

function getStats() {
    getContributorTypes()
        .then(function () {
            let query = db.select('committee_name', 'normalized', 'state')
                .sum('amount as subtotal')
                .from('contributions');
            let start = '0';
            addFilters(query);
            query.groupBy('committee_name', 'normalized', 'state')
                .having('subtotal', '>', 0)
                .then(function (rows) {
                    const officeRegex = program.office ? new RegExp(program.office, 'i') : null;
                    let prevOffice = '';
                    let headers;
                    let format;
                    let officeFormat;
                    if (program.html) {
                        headers = '<table>\n<tr>' +
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
                        format = '<tr><td style="text-indent: 1em">%s</td>' +
                            '<td style="text-align: right">%s</td>' +
                            '<td style="text-align: right; white-space: nowrap">%s</td>' +
                            '<td style="text-align: right; white-space: nowrap">%s</td>' +
                            '<td style="text-align: right">$%s</td>' +
                            '<td style="text-align: right">$%s</td>' +
                            '<td style="text-align: right">$%s</td>' +
                            '<td style="text-align: right">%s</td>' +
                            '<td style="text-align: right">%s</td>' +
                            '<td style="text-align: right">%s</td>';
                        officeFormat = '<tr><td colspan="9">%s</td></tr>';
                        bins.forEach(function (end) {
                            headers += '<th  style="text-align: right">' + start + '-<br>' + end + '</th>';
                            format += '<td style="text-align: right">%s</td>';
                            start = (end + 0.01).toFixed(2);
                        });
                        headers += '<th  style="text-align: right">' + start + '+</th>';
                        format += '<td style="text-align: right">%s</td>';
                        headers += '</tr>';
                        format += '</tr>';
                    }
                    else if (program.csv) {
                        headers = [
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
                        const columnCount = 11 + bins.length;
                        format = Array(columnCount).fill('%s').join('\t');
                        officeFormat = '%s';
                        bins.forEach(function (end) {
                            headers += '\t' + start + '-' + end;
                            start = (end + 0.01).toFixed(2);
                        });
                        headers += '\t' + start + '+';
                    }
                    else {
                        headers = 'Candidate             Contributions  Contributors  DCIndContbr    ' +
                            'Amount   Mean  Median  %Ind %DC %DCInd';
                        format = '%-20s %14s %13s %12s %9s  %5s  %6s  %4s %3s %6s';
                        officeFormat = '%s';
                        bins.forEach(function (end) {
                            const header = start + '-' + end;
                            headers += '  ' + header;
                            format += '  %' + header.length + 's';
                            start = (end + 0.01).toFixed(2);
                        });
                        headers += '  ' + start + '+';
                        format += '  %' + (start.length + 1) + 's';
                    }
                    console.log(headers);
                    rows.forEach(function (row) {
                        data[row.committee_name].amountList.push(row.subtotal);
                        for (let i = 0; i < bins.length; i++) {
                            if (row.subtotal <= bins[i]) {
                                data[row.committee_name].binAmounts[i] += row.subtotal;
                                break;
                            }
                        }
                        if (i >= bins.length) {
                            data[row.committee_name].binAmounts[i] += row.subtotal;
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
                        if (c.amount < program.threshold || (officeRegex && !officeRegex.test(c.office))) {
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
                        bins.forEach(function (end, i) {
                            values.push((100 * c.binAmounts[i] / c.amount).toFixed(2));
                        });
                        values.push((100 * c.binAmounts[bins.length] / c.amount).toFixed(2));
                        if (c.office !== prevOffice && !program.csv) {
                            console.log(vsprintf(officeFormat, [c.office.toUpperCase()]));
                        }
                        console.log(vsprintf(format, values));
                        // console.log(c.binCounts);
                        prevOffice = c.office;
                    });
                    if (program.html) {
                        console.log('</table>\n');
                    }
                    // printCrossCandidateContributions();
                    process.exit();
                });
        });
}

function getContributorTypes() {
    let query = db.distinct('contributor_type')
        .from('contributions');
    addFilters(query);
    return query.orderBy('contributor_type')
        .then(function (rows) {
            contributorTypes = _.pluck(rows, 'contributor_type');
            console.log(contributorTypes);
            let subquery = db.select('committee_name', 'contributor_type')
                .sum('amount as amount')
                .from('contributions');
            addFilters(subquery);
            return subquery.groupBy('committee_name', 'contributor_type')
                .then(function (rows) {
                    rows.forEach(function (c) {
                        data[c.committee_name].amountByType[c.contributor_type] = c.amount;
                    });
                });
        });
}

function addFilters(query) {
    if (program.since) {
        query = query.andWhere('receipt_date', '>=', program.since);
    }
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
