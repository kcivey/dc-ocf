# DC Campaign Finance Report Analysis

## Setup for processing data

You need to install [Node.js](https://nodejs.org). On Linux or OS X, you can use 
[Node Version Manager](https://github.com/creationix/nvm). Once you have it installed,
go to this directory and run

    npm install

For simplicity this currently uses SQLite for the database, so no database server is
needed, but it should be relatively easy to modify it to use MySQL or PostgreSQL.

## Download data

To download the CSV files for committees, contributions, and expenditures, run

    ./download-csv.js --all

## Load data into database

Once you have the files committees.csv, contributions.csv, and expenditures.csv,
create and load the database by running

    ./load-data.js

You may want to install the SQLite command-line client (`sudo apt install sqlite3`
on Ubuntu) for looking at the database and trying out queries.

## Old way

If you have to download the CSV files manually for some reason (like OCF changing
the website), then after you've downloaded you have to convert them from UTF-16
(why are they in that?) to UTF-8 and delete the first line, which isn't CSV.
You can do it like this:

iconv -f UTF-16 -t UTF-8 downloaded-file.csv | tail -n +2 > good-file.csv
