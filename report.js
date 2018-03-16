#!/usr/bin/env node

var vsprintf = require("sprintf-js").vsprintf,
    stats = require('stats-lite'),
    _ = require('underscore'),
    program = require('commander'),
    db = require('./db'),
    data = {},
    contributorTypes;

program.option('--html', 'HTML output')
    .parse(process.argv);

db.select(
        'office',
        'contributions.committee_name',
        'candidate_name',
        db.raw("sum(case when contributor_state = 'DC' then amount else 0 end) as dc_amount"),
        db.raw("sum(case when contributor_type in ('Individual', 'Candidate') then amount else 0 end) as ind_amount"),
        db.raw("sum(case when contributor_state = 'DC' and contributor_type in ('Individual', 'Candidate') then amount else 0 end) as dc_ind_amount")
    )
    .count('* as contributions')
    .sum('amount as amount')
    .from('contributions')
    .innerJoin('committees', 'contributions.committee_name', 'committees.committee_name')
    .groupBy('office', 'contributions.committee_name', 'candidate_name')
    .orderBy('office')
    .orderBy('candidate_name')
    .then(function (rows) {
        rows.forEach(function (row) {
            //console.log(row.committee_name);
            row.amountList = [];
            row.amountByType = {};
            data[row.committee_name] = row;
        });
        getStats();
    });

function getStats() {
    getContributorTypes()
        .then(function () {
            db.select('committee_name', 'normalized')
                .sum('amount as subtotal')
                .from('contributions')
                .groupBy('committee_name', 'normalized')
                .having('subtotal', '>', 0)
                .then(function (rows) {
                    var prevOffice = '',
                        headers = 'Candidate         ' +
                            'Contributions  Contributors       Amount     Mean   Median  %Ind %DC %DCInd',
                        format = program.html ?
                            '<tr><td style="text-indent: 1em">%s</td><td style="text-align: right">%d</td>' +
                            '<td style="text-align: right; white-space: nowrap">%d</td><td style="text-align: right">$%s</td>' +
                            '<td style="text-align: right">$%s</td><td style="text-align: right">$%s</td>' +
                            '<td style="text-align: right">%.0f</td><td style="text-align: right">%.0f</td>' +
                            '<td style="text-align: right">%.0f</td></tr>' :
                            '%-20s %10d %13d  %11.2f  %7.2f  %7.2f  %4.0f %3.0f %6.0f',
                        officeFormat = program.html ? '<tr><td colspan="9">%s</td></tr>' : '%s';

                    if (program.html) {
                        console.log('<table><tr><th>Candidate</th><th style="text-align: right">Contributions</th>' +
                            '<th style="text-align: right">Contributors</th><th style="text-align: right">Amount</th>' +
                            '<th style="text-align: right">Mean</th><th style="text-align: right">Median</th>' +
                            '<th style="text-align: right">%Ind</th><th style="text-align: right">%DC</th>' +
                            '<th style="text-align: right">%DCInd</th></tr>');
                    }
                    else {
                        console.log(headers);
                    }
                    rows.forEach(function (row) {
                        data[row.committee_name].amountList.push(row.subtotal);
                    });
                    _.each(data, function (c) {
                        var values = [
                                c.candidate_name,
                                c.contributions,
                                c.amountList.length,
                                c.amount
                            ];
                        if (c.amount < 10000) {
                            return;
                        }
                        c.amountList = c.amountList.sort(function (a, b) { return a - b; });
                        values.push(
                            stats.mean(c.amountList),
                            stats.median(c.amountList),
                            100 * c.ind_amount / c.amount,
                            100 * c.dc_amount / c.amount,
                            100 * c.dc_ind_amount / c.amount
                            //c.amountList[0],
                            //c.amountList[c.amountList.length - 1]
                        );
                        if (program.html) {
                            [3, 4, 5].forEach(function (i) {
                                values[i] = Math.round(values[i]).toLocaleString();
                            });
                        }
                        if (c.office !== prevOffice) {
                            console.log(vsprintf(officeFormat, [c.office.toUpperCase()]));
                        }
                        console.log(vsprintf(format, values));
                        prevOffice = c.office;
                    });
                    //printCrossCandidateContributions();
                    process.exit();
                });
        });
}

function getContributorTypes() {
    return db.distinct('contributor_type')
        .from('contributions')
        .orderBy('contributor_type')
        .then(function (rows) {
            contributorTypes = _.pluck(rows, 'contributor_type');
            //console.log(contributorTypes);
            return db.select('committee_name', 'contributor_type')
                .sum('amount as amount')
                .from('contributions')
                .groupBy('committee_name', 'contributor_type')
                .then(function (rows) {
                    rows.forEach(function (c) {
                        data[c.committee_name].amountByType[c.contributor_type] = c.amount;
                    });
                });
        });
}

function printCrossCandidateContributions() {
    var makeContributorQueryFn = function (alias) {
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
            var prev = '',
                total;
            rows.forEach(function (row) {
                if (prev !== row.candidate1) {
                    console.log(row.candidate1);
                    total = row.subtotal1;
                    prev = row.candidate1;
                }
                //else {
                    console.log(vsprintf('  %20s %5d %8s %5.2f%%', [
                        row.candidate2,
                        row.contributors,
                        '$' + Math.round(row.subtotal1).toLocaleString(),
                        100 * (row.subtotal1 / total),
                        row.subtotal2
                    ]));
                //}
            });
            process.exit();
        });
}
