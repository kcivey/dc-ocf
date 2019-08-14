const path = require('path');
const statsLite = require('stats-lite');
const db = require('knex')(
    {
        client: 'sqlite3',
        connection: {
            filename: path.dirname(__dirname) + '/dc-ocf.sqlite',
        },
        pool: {
            afterCreate: (conn, cb) => conn.run('PRAGMA foreign_keys = ON', cb),
        },
        useNullAsDefault: true,
    }
);
const committeeTableName = 'committees';
const committeeColumns = [
    'committee_name',
    'candidate_name',
    'election_year',
    'status',
    'office',
];
const contributionTableName = 'contributions';
const contributionColumns = [
    'committee_name',
    'contributor_first_name',
    'contributor_middle_name',
    'contributor_last_name',
    'contributor_organization_name',
    'number_and_street',
    'city',
    'state',
    'zip',
    'contributor_type',
    'contribution_type',
    'employer_name',
    'employer_address',
    'occupation',
    'receipt_date',
    'amount',
    'normalized',
    'mar_confidence_level',
    'mar_address',
    'mar_ward',
    'mar_latitude',
    'mar_longitude',
];
const expenditureTableName = 'expenditures';
const expenditureColumns = [
    'committee_name',
    'payee_first_name',
    'payee_middle_name',
    'payee_last_name',
    'payee_organization_name',
    'number_and_street',
    'city',
    'state',
    'zip',
    'purpose_of_expenditure',
    'payment_date',
    'amount',
    'normalized',
];
const defaultBatchSize = 25;

function createTables() {
    return db.schema.dropTableIfExists(contributionTableName)
        .dropTableIfExists(expenditureTableName)
        .dropTableIfExists(committeeTableName)
        .createTable(
            committeeTableName,
            function (table) {
                table.increments();
                for (const columnName of committeeColumns) {
                    if (/year/.test(columnName)) {
                        table.integer(columnName);
                    }
                    else {
                        table.string(columnName);
                    }
                }
                table.unique('committee_name');
            }
        )
        .createTable(
            contributionTableName,
            function (table) {
                table.increments();
                for (const columnName of contributionColumns) {
                    if (/date/.test(columnName)) {
                        table.date(columnName);
                    }
                    else if (/amount|total|confidence|latitude|longitude/.test(columnName)) {
                        table.float(columnName);
                    }
                    else if (/ward/.test(columnName)) {
                        table.integer(columnName);
                    }
                    else {
                        table.string(columnName);
                    }
                }
                table.foreign('committee_name')
                    .references('committee_name')
                    .inTable(committeeTableName)
                    .onDelete('CASCADE');
                table.index('committee_name');
            }
        )
        .createTable(
            expenditureTableName,
            function (table) {
                table.increments();
                for (const columnName of expenditureColumns) {
                    if (/date/.test(columnName)) {
                        table.date(columnName);
                    }
                    else if (/amount|total/.test(columnName)) {
                        table.float(columnName);
                    }
                    else {
                        table.string(columnName);
                    }
                }
                table.foreign('committee_name')
                    .references('committee_name')
                    .inTable(committeeTableName)
                    .onDelete('CASCADE');
                table.index('committee_name');
            }
        );
}

function batchInsert(tableName, records, batchSize = defaultBatchSize) {
    return db.batchInsert(tableName, records, batchSize);
}

// Add negative contributions corresponding to refunds and bounced checks
function addDummyContributions() {
    return db(contributionTableName)
        .where('amount', '<', 0)
        .del()
        .then(function () {
            return db
                .select(
                    'e.committee_name',
                    'e.payee_first_name as contributor_first_name',
                    'e.payee_middle_name as contributor_middle_name',
                    'e.payee_last_name as contributor_last_name',
                    'e.number_and_street',
                    'e.city',
                    'e.state',
                    'e.zip',
                    'e.normalized',
                    'c.contributor_type',
                    'e.purpose_of_expenditure as contribution_type',
                    'c.employer_name',
                    'c.employer_address',
                    'c.occupation',
                    'e.payment_date as receipt_date',
                    db.raw('-e.amount AS amount')
                )
                .from('expenditures AS e')
                .innerJoin('contributions AS c', function () {
                    this.on('e.committee_name', 'c.committee_name')
                        .andOn('e.normalized', 'c.normalized');
                })
                .whereIn('purpose_of_expenditure', ['Refund', 'Return Check and Fees'])
                .groupBy('e.id')
                .orderBy('e.committee_name')
                .orderBy('e.payee_last_name')
                .orderBy('e.payee_first_name')
                .orderBy('e.payee_middle_name');
        })
        .then(rows => batchInsert(contributionTableName, rows));
}

function getContributionInfo(filters) {
    let query = db(contributionTableName)
        .select(
            'office',
            'contributions.committee_name',
            'candidate_name',
            db.raw("SUM(CASE WHEN state = 'DC' THEN amount ELSE 0 END) AS dc_amount"),
            db.raw("SUM(CASE WHEN contributor_type IN ('Individual', 'Candidate') " +
                'THEN amount ELSE 0 END) AS ind_amount'),
            db.raw("SUM(CASE WHEN state = 'DC' AND contributor_type IN ('Individual', 'Candidate') " +
                'THEN amount ELSE 0 END) AS dc_ind_amount'),
            db.raw('SUM(CASE WHEN amount > 0 THEN 1 WHEN amount < 0 THEN -1 ELSE 0 END) AS contributions')
        )
        .sum('amount AS amount')
        .join('committees', 'contributions.committee_name', 'committees.committee_name');
    query = addFilters(query, filters);
    return query.groupBy('office', 'contributions.committee_name', 'candidate_name')
        .orderBy('office')
        .orderBy('candidate_name');
}

async function getContributionStats({filters, bins}) {
    const data = {};
    let rows = await getContributionInfo(filters);
    for (const row of rows) {
        row.amountList = [];
        if (bins && bins.length) {
            row.binAmounts = bins.map(() => 0).concat([0]);
        }
        row.dc_ind_contributors = 0;
        data[row.committee_name] = row;
    }
    const amounts = await getContributionAmountsByType(filters);
    for (const [committee, obj] of Object.entries(amounts)) {
        data[committee].amountByType = obj;
    }
    rows = await getContributionSubtotals(filters);
    for (const row of rows) {
        data[row.committee_name].amountList.push(row.subtotal);
        if (bins && bins.length) {
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
    }
    for (const c of Object.values(data)) {
        c.mean = statsLite.mean(c.amountList);
        c.median = statsLite.median(c.amountList);
    }
    return data;
}

function addFilters(oldQuery, filters) {
    let query = oldQuery.clone();
    if (filters.since) {
        query = query.andWhere('receipt_date', '>=', filters.since);
    }
    if (filters.office) {
        query = query.andWhere('office', 'LIKE', '%' + filters.office + '%');
    }
    return query;
}

function getContributionSubtotals(filters) {
    let query = db(contributionTableName)
        .select('contributions.committee_name', 'normalized', 'state')
        .sum('amount AS subtotal');
    if (filters.office) {
        query = query.join('committees', 'contributions.committee_name', 'committees.committee_name');
    }
    query = addFilters(query, filters);
    return query.groupBy('contributions.committee_name', 'normalized', 'state')
        .having('subtotal', '>', 0);
}

async function getContributionAmountsByType(filters) {
    let query = db(contributionTableName)
        .select('contributions.committee_name', 'contributor_type')
        .sum('amount AS amount');
    if (filters.office) {
        query = query.join('committees', 'contributions.committee_name', 'committees.committee_name');
    }
    query = addFilters(query, filters);
    const rows = await query.groupBy('contributions.committee_name', 'contributor_type');
    const data = {};
    for (const row of rows) {
        if (!data[row.committee_name]) {
            data[row.committee_name] = {};
        }
        data[row.committee_name][row.contributor_type] = row.amount;
    }
    return data;
}

function deleteContributions(committeeName) {
    return db(contributionTableName)
        .where('committee_name', committeeName)
        .del();
}

function deleteExpenditures(committeeName) {
    return db(expenditureTableName)
        .where('committee_name', committeeName)
        .del();
}

function getUnverifiedContributionAddresses(limit = 100) {
    return db(contributionTableName)
        .select('id', 'number_and_street AS address')
        .where('state', 'DC')
        .andWhere('mar_confidence_level', null)
        .orderBy('id')
        .limit(limit);
}

function updateContribution(id, partialRecord) {
    return db(contributionTableName)
        .where('id', id)
        .update(partialRecord);
}

function getDcContributionsWithPositions(filters) {
    let query = db(contributionTableName)
        .join('committees', 'committees.committee_name', 'contributions.committee_name')
        .select(
            'candidate_name AS candidate',
            db.raw('ROUND(mar_latitude, 5) AS latitude'),
            db.raw('ROUND(mar_longitude, 5) AS longitude')
        )
        .countDistinct('normalized AS contributors')
        .where('state', 'DC')
        .andWhere('contributor_type', 'Individual')
        .andWhereNot('mar_confidence_level', 0)
        .andWhereNot('mar_confidence_level', null);
    query = addFilters(query, filters);
    return query.groupBy('candidate_name', 'latitude', 'longitude')
        .then(function (rows) {
            const data = {};
            for (const {candidate, latitude, longitude, contributors} of rows) {
                if (!data[candidate]) {
                    data[candidate] = [];
                }
                data[candidate].push({position: [latitude, longitude], contributors});
            }
            return data;
        });
}

function getContributionsByDate(filters) {
    return db(contributionTableName)
        .select('receipt_date', 'candidate_name')
        .count('* as contributions')
        .sum('amount as amount')
        .join('committees', 'contributions.committee_name', 'committees.committee_name')
        .where('office', 'LIKE', '%Ward 2%')
        .groupBy('receipt_date', 'candidate_name')
        .orderBy('receipt_date')
        .orderBy('candidate_name')
}

function getCandidatesForOffice(office) {
    return db(committeeTableName)
        .select('candidate_name')
        .where('office', 'LIKE', '%' + office + '%')
        .orderBy('candidate_name')
        .pluck('candidate_name');
}

function close() {
    return db.destroy();
}

module.exports = {
    addDummyContributions,
    batchInsert,
    committeeColumns,
    committeeTableName,
    contributionColumns,
    contributionTableName,
    close,
    createTables,
    deleteContributions,
    deleteExpenditures,
    expenditureColumns,
    expenditureTableName,
    getCandidatesForOffice,
    getContributionAmountsByType,
    getContributionsByDate,
    getContributionStats,
    getContributionSubtotals,
    getDcContributionsWithPositions,
    getUnverifiedContributionAddresses,
    updateContribution,
};

