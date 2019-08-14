#!/usr/bin/env node

const db = require('../lib/db');

main()
    .catch(console.error)
    .finally(() => db.close());

async function main() {
    const data = await db.getDcContributionsWithPositions('Council Ward 2');
    process.stdout.write(JSON.stringify(data, null, 2));
}
