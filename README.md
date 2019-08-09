# DC Campaign Finance Report Analysis

## Setup for processing data

You need to install [Node.js](https://nodejs.org). On Linux or OS X, you can use 
[Node Version Manager](https://github.com/creationix/nvm). Once you have it installed,
go to this directory and run

    npm install

For simplicity this currently uses SQLite for the database, so no database server is
needed, but it should be relatively easy to modify it to use MySQL or PostgreSQL.

## Download contributions

Unfortunately a change to the OCF website has broken the automated download of 
expenditures, so we have to go back to manual downloading.

Go to [Contribution and Expenditure Search](https://efiling.ocf.dc.gov/ContributionExpenditure) and select
"Principle Campaign Committee" and "Expenditures", click "Date" and
enter "01/01/2018" in "From Date", then click "Search".

On the next page, click the dropdown next to "Export" and select
"CSV". A file named "ContributionsExpendituresSearchResult.csv" will
be downloaded. Move it to this directory. Then to fix the character
encoding and delete the first line (a title that comes before the
header line), run

    iconv -f UTF-16 -t UTF-8 ContributionsExpendituresSearchResult.csv | tail -n +2 > expenditures.csv

(If you don't have iconv on your system, you can convert the encoding
by some other means, and you can delete the first line in a text editor
instead of using tail.)

## Download data

To download the CSV files for committees and contributions, run

    ./download-csv.js --committees --contributions

## Load data into database

Once you have the files committees.csv, contributions.csv, and expenditures.csv,
create and load the database by running

    ./load-data.js

You may want to install the SQLite command-line client (`sudo apt install sqlite3`
on Ubuntu) for looking at the database and trying out queries.
