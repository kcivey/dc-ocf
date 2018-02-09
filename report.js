#!/usr/bin/env node

var vsprintf = require("sprintf-js").vsprintf,
    stats = require('stats-lite'),
    _ = require('underscore'),
    db = require('./db'),
    data = {},
    contributorTypes;

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
                        format = '%-20s %10d %13d  %11.2f  %7.2f  %7.2f  %4.0f %3.0f %6.0f',
                        htmlFormat = '<tr><td style="text-indent: 1em">%s</td><td style="text-align: right">%d</td>' +
                            '<td style="text-align: right; white-space: nowrap">%d</td><td style="text-align: right">$%s</td>' +
                            '<td style="text-align: right">$%s</td><td style="text-align: right">$%s</td>' +
                            '<td style="text-align: right">%.0f</td><td style="text-align: right">%.0f</td>' +
                            '<td style="text-align: right">%.0f</td></tr>';
                    //console.log(headers);
                    console.log('<table><tr><th>Candidate</th><th style="text-align: right">Contributions</th>' +
                        '<th style="text-align: right">Contributors</th><th style="text-align: right">Amount</th>' +
                        '<th style="text-align: right">Mean</th><th style="text-align: right">Median</th>' +
                        '<th style="text-align: right">%Ind</th><th style="text-align: right">%DC</th>' +
                        '<th style="text-align: right">%DCInd</th></tr>');
                    rows.forEach(function (row) {
                        data[row.committee_name].amountList.push(row.subtotal);
                    });
                    _.each(data, function (c) {
                        var values = [
                                c.candidate_name,
                                c.contributions,
                                c.amountList.length,
                                Math.round(c.amount).toLocaleString()
                            ];
                        c.amountList = c.amountList.sort(function (a, b) { return a - b; });
                        values.push(
                            Math.round(stats.mean(c.amountList)).toLocaleString(),
                            Math.round(stats.median(c.amountList)).toLocaleString(),
                            100 * c.ind_amount / c.amount,
                            100 * c.dc_amount / c.amount,
                            100 * c.dc_ind_amount / c.amount
                            //c.amountList[0],
                            //c.amountList[c.amountList.length - 1]
                        );
                        if (c.office !== prevOffice) {
                            console.log('<tr><td colspan="9">' + c.office.toUpperCase() + '</td></tr>');
                        }
                        console.log(vsprintf(htmlFormat, values));
                        prevOffice = c.office;
                    });
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
