const fs = require('fs');
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
const {normalizeNameAndAddress} = require('./util');
const committeeTableName = 'committees';
const committeeColumns = [
    'committee_name',
    'candidate_name',
    'candidate_short_name',
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
const marTableName = 'mar';
const marColumns = [
    'ocf_address',
    'confidence_level',
    'address',
    'ward',
    'latitude',
    'longitude',
];
const viewName = 'combined_contributions_view';
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
                    else if (columnName === 'amount') {
                        table.float(columnName);
                    }
                    else if (columnName === 'ward') {
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
        )
        .hasTable(marTableName)
        .then(function (exists) {
            if (exists) {
                return;
            }
            return db.schema
                .createTableIfNotExists(
                    marTableName,
                    function (table) {
                        table.increments();
                        for (const columnName of marColumns) {
                            switch (columnName) {
                                case 'confidence_level':
                                case 'ward':
                                    table.integer(columnName);
                                    break;
                                case 'latitude':
                                case 'longitude':
                                    table.float(columnName);
                                    break;
                                default:
                                    table.string(columnName);
                            }
                        }
                        table.unique('ocf_address');
                    }
                );
        })
        .then(function () {
            const groupColumns = [
                'con.committee_name',
                'candidate_short_name',
                'office',
                'normalized',
                'contributor_type',
                'state',
                'ward',
                'latitude',
                'longitude',
                'confidence_level',
            ].join(', ');
            return db.raw(
                `CREATE VIEW IF NOT EXISTS ${viewName} AS
                SELECT ${groupColumns},
                    SUM(amount) AS amount,
                    SUM(CASE WHEN amount > 0 THEN 1 WHEN amount < 0 THEN -1 ELSE 0 END) AS contributions,
                    CASE WHEN state = 'DC' THEN 1 ELSE 0 END AS is_dc,
                    CASE WHEN contributor_type IN ('Individual', 'Candidate') THEN 1 ELSE 0 END AS is_individual
                FROM ${contributionTableName} con
                    INNER JOIN ${committeeTableName} com ON con.committee_name = com.committee_name
                    LEFT JOIN ${marTableName} m ON con.number_and_street = m.ocf_address
                GROUP BY ${groupColumns}
                HAVING SUM(amount) <> 0`
            );
        });
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
                .from(`${expenditureTableName} AS e`)
                .join(`${contributionTableName} AS c`, function () {
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

function getContributionInfo(filters, ward) {
    const query = db(viewName)
        .select(
            'office',
            'committee_name',
            'candidate_short_name',
            db.raw('SUM(CASE WHEN is_dc THEN amount END) AS dc_amount'),
            db.raw('SUM(CASE WHEN is_individual THEN amount END) AS ind_amount'),
            db.raw('SUM(CASE WHEN is_dc AND is_individual THEN amount END) AS dc_ind_amount'),
            db.raw('COUNT(DISTINCT CASE WHEN is_dc THEN normalized END) AS dc_contributors'),
            db.raw('COUNT(DISTINCT CASE WHEN is_individual THEN normalized END) AS ind_contributors'),
            db.raw('COUNT(DISTINCT CASE WHEN is_dc AND is_individual THEN normalized END) AS dc_ind_contributors'),
        )
        .countDistinct('normalized as contributors')
        .sum('amount AS amount')
        .sum('contributions AS contributions');
    if (ward) {
        query
            .select(
                db.raw('SUM(CASE WHEN ward = ? THEN amount END) AS ward_amount', [ward]),
                db.raw('SUM(CASE WHEN ward = ? AND is_individual THEN amount END) AS ward_ind_amount', [ward]),
                db.raw('COUNT(CASE WHEN ward = ? THEN 1 END) AS ward_contributors', [ward]),
                db.raw('COUNT(CASE WHEN ward = ? AND is_individual THEN 1 END) AS ward_ind_contributors', [ward]),
            );
    }
    return query
        .modify(addFilters, filters)
        .groupBy('office', 'committee_name', 'candidate_short_name')
        .orderBy('office')
        .orderBy('candidate_short_name');
}

async function getContributionStats({filters, bins, ward}) {
    const data = {};
    let rows = await getContributionInfo(filters, ward);
    for (const row of rows) {
        row.amount_list = [];
        if (bins && bins.length) {
            row.bin_amounts = bins.map(() => 0).concat([0]);
        }
        data[row.committee_name] = row;
    }
    const amounts = await getContributionAmountsByType(filters);
    for (const [committee, obj] of Object.entries(amounts)) {
        data[committee].amount_by_type = obj;
    }
    rows = await db(viewName)
        .select('committee_name', 'amount')
        .modify(addFilters, filters);
    for (const row of rows) {
        data[row.committee_name].amount_list.push(row.amount);
        if (bins && bins.length) {
            let i = 0;
            for (i = 0; i < bins.length; i++) {
                if (row.amount <= bins[i]) {
                    data[row.committee_name].bin_amounts[i] += row.amount;
                    break;
                }
            }
            if (i >= bins.length) {
                data[row.committee_name].bin_amounts[i] += row.amount;
            }
        }
    }
    for (const c of Object.values(data)) {
        c.dc_percent = 100 * c.dc_amount / c.amount;
        c.ind_percent = 100 * c.ind_amount / c.amount;
        c.dc_ind_percent = 100 * c.dc_ind_amount / c.amount;
        if (ward) {
            c.ward_percent = 100 * c.ward_amount / c.amount;
        }
        c.amount_list = c.amount_list.sort((a, b) => a - b);
        c.mean = statsLite.mean(c.amount_list);
        c.median = statsLite.median(c.amount_list);
        delete c.amount_list;
    }
    return data;
}

function getMatchingOffice(pattern) {
    return db(committeeTableName)
        .select('office')
        .where('office', 'LIKE', '%' + pattern + '%')
        .limit(1)
        .then(rows => rows[0].office);
}

function addFilters(query, filters) {
    if (filters) {
        if (filters.since) {
            query.andWhere('receipt_date', '>=', filters.since);
        }
        if (filters.office) {
            query.andWhere('office', 'LIKE', '%' + filters.office + '%');
        }
    }
}

async function getContributionAmountsByType(filters) {
    const rows = await db(viewName)
        .select('committee_name', 'contributor_type')
        .sum('amount AS amount')
        .modify(addFilters, filters)
        .groupBy('committee_name', 'contributor_type');
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
        .distinct('number_and_street AS address')
        .leftJoin(marTableName, 'ocf_address', 'number_and_street')
        .where('state', 'DC')
        .andWhere('confidence_level', null)
        .orderBy('address')
        .limit(limit)
        .then(rows => rows.map(r => r.address)); // don't know why .pluck() doesn't work here
}

function updateContribution(id, partialRecord) {
    return db(contributionTableName)
        .where('id', id)
        .update(partialRecord);
}

function getDcContributionsWithPositions(filters) {
    return db(viewName)
        .select(
            'candidate_short_name AS candidate',
            db.raw('ROUND(latitude, 5) AS latitude'),
            db.raw('ROUND(longitude, 5) AS longitude')
        )
        .count('* AS contributors')
        .where('state', 'DC')
        .andWhere('contributor_type', 'Individual')
        .andWhere('confidence_level', '>', 90)
        .modify(addFilters, filters)
        .groupBy('candidate_short_name', 'latitude', 'longitude')
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
        .select('receipt_date', 'candidate_short_name')
        .countDistinct('normalized AS contributors')
        .sum('amount AS amount')
        .join(committeeTableName, `${contributionTableName}.committee_name`, `${committeeTableName}.committee_name`)
        .modify(addFilters, filters)
        .groupBy('receipt_date', 'candidate_short_name')
        .orderBy('receipt_date')
        .orderBy('candidate_short_name');
}

function getCandidatesForOffice(office) {
    return db(committeeTableName)
        .select('candidate_short_name')
        .where('office', 'LIKE', '%' + office + '%')
        .orderBy('candidate_short_name')
        .pluck('candidate_short_name');
}

async function runFixes() {
    const statements = fs.readFileSync(path.dirname(__dirname) + '/fixes.sql', 'utf-8')
        .trim()
        .split(';\n');
    for (let statement of statements) {
        statement = statement.replace(
            `UPDATE ${contributionTableName} SET `,
            `UPDATE ${contributionTableName} SET normalized = null, `
        );
        await db.raw(statement);
    }
    await setNormalized();
}

async function setNormalized() {
    for (const tableName of [contributionTableName, expenditureTableName]) {
        const rows = await db(tableName)
            .select('*')
            .where('normalized', null);
        for (const row of rows) {
            await db(tableName)
                .update('normalized', normalizeNameAndAddress(row))
                .where('id', row.id);
        }
    }
}

function close() {
    return db.destroy();
}

module.exports = {
    addDummyContributions,
    batchInsert,
    close,
    committeeColumns,
    committeeTableName,
    contributionColumns,
    contributionTableName,
    createTables,
    deleteContributions,
    deleteExpenditures,
    expenditureColumns,
    expenditureTableName,
    getCandidatesForOffice,
    getContributionAmountsByType,
    getContributionsByDate,
    getContributionStats,
    getDcContributionsWithPositions,
    getMatchingOffice,
    getUnverifiedContributionAddresses,
    marColumns,
    marTableName,
    runFixes,
    setNormalized,
    updateContribution,
};

