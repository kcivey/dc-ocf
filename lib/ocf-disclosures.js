const assert = require('assert');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const {createBrowser} = require('./browser');
const request = require('./request');
const cacheFile = path.resolve(__dirname, '../cache/last-seen-committees.json');

class OcfDisclosures {

    constructor(properties) {
        Object.assign(
            this,
            {
                verbose: false,
                startUrl: 'https://efiling.ocf.dc.gov/Disclosure',
                browser: createBrowser({verbose: properties.verbose}),
                limit: null,
                year: null,
                withDetails: false,
                useLastSeen: true,
            },
            properties
        );
    }

    log(...args) {
        if (this.verbose) {
            console.warn(...args);
        }
    }

    async openStartUrl() {
        if (!this.browser.document) {
            this.log(`Getting ${this.startUrl}`);
            await this.browser.visit(this.startUrl);
        }
    }

    async getFilerTypes() {
        await this.openStartUrl();
        this.browser.assert.text('h3', 'Registrant Disclosure Search');
        const types = [];
        const options = this.browser.field('#FilerTypeId').options;
        for (const option of options) {
            if (option.value) {
                types.push(option.text);
            }
        }
        return types;
    }

    getLastSeen(types) {
        if (!this.useLastSeen) {
            const lastSeen = {};
            for (const type of types) {
                lastSeen[type] = null;
            }
            return Promise.resolve(lastSeen);
        }
        return new Promise(function (resolve, reject) {
            fs.readFile(cacheFile, function (err, json) {
                let lastSeen = {};
                if (err) {
                    if (err.code !== 'ENOENT') {
                        return reject(err);
                    }
                }
                else {
                    lastSeen = JSON.parse(json);
                }
                for (const type of types) {
                    if (!lastSeen[type]) {
                        lastSeen[type] = null;
                    }
                }
                return resolve(lastSeen);
            });
        });
    }

    async findNewRecords(lastSeen) {
        await this.openStartUrl();
        const allNewRecords = {};
        let changed = false;
        for (const [type, lastSeenId] of Object.entries(lastSeen)) {
            this.log(`Getting ${type} records`);
            const newRecords = await this.findNewRecordsForType(type, lastSeenId);
            if (newRecords.length) {
                lastSeen[type] = newRecords[0].Id;
                changed = true;
                allNewRecords[type] = newRecords;
            }
        }
        if (changed && this.useLastSeen) {
            fs.writeFileSync(cacheFile, JSON.stringify(lastSeen, null, 2));
        }
        return allNewRecords;
    }

    async findNewRecordsForType(type, lastSeenId) {
        await this.browser.select('#FilerTypeId', type);
        if (this.year) {
            await this.browser.select('#ElectionYear', this.year.toString());
        }
        await this.browser.click('#btnSubmitSearch');
        this.browser.assert.text('#divSearchResults h3', `${type} Search Result`);
        if (this.limit) {
            await this.browser.select('DashBoard_length', '100');
        }
        const records = this.getSearchData();
        const newRecords = [];
        for (const record of records) {
            this.log(record);
            assert(record.Id, 'ID not found in ' + JSON.stringify(record, null, 2));
            if (lastSeenId && record.Id <= lastSeenId) {
                break;
            }
            if (this.withDetails) {
                const details = await this.getDetails(record.Id);
                Object.assign(record, details);
            }
            newRecords.push(record);
        }
        return newRecords;
    }

    async getDetails(id) {
        assert(id, 'Missing ID');
        const details = {};
        const keyMapping = {
            Address: ['Address', 'Committee Address'],
            Phone: ['Phone', 'Committee Phone', 'Treasurer Phone', 'Chair Phone'],
            Email: ['Email', 'Treasurer Email', 'Chair Email'],
            'Committee ID': ['Committee Alphanumeric ID'],
        };
        const keyCounts = {};
        const html = await request('https://efiling.ocf.dc.gov/Disclosure/FilingHistory/' + id);
        const $ = cheerio.load(html);
        $('.summarylabel > div').each(function (i, el) {
            let key = $('.filinghistoryleftlabel', el)
                .text()
                .trim()
                .replace(/:$/, '');
            if (!key) {
                return;
            }
            if (keyMapping[key]) {
                keyCounts[key] = keyCounts.hasOwnProperty(key) ? keyCounts[key] + 1 : 0;
                key = keyMapping[key][keyCounts[key]];
            }
            details[key] = $('.filinghistoryrightlabel', el)
                .text()
                .trim()
                .replace(/\s+/g, ' ')
                .replace(/^(.+?\S) \1$/, '$1'); // something weird going on with committee phone
        });
        if (Object.keys(details).length < 1) {
            console.warn(`No details found for ${id}`); // problem with OCF database
        }
        return details;
    }

    getSearchData() {
        let i = this.browser.resources.length;
        while (i > 0) {
            i--;
            const resource = this.browser.resources[i];
            if (resource.request.url.match(/\/Search$/)) {
                if (resource.error) {
                    throw resource.error;
                }
                return JSON.parse(resource.response.body).data;
            }
        }
        throw new Error('Search data not found');
    }

}

module.exports = OcfDisclosures;
