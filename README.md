Download contributions
======================

I want to automate this, but the .dc.gov websites are not friendly
to scraping or much of anything else.

Go to https://efiling.ocf.dc.gov/ContributionExpenditure and select
"Principle Campaign Committee" and "Contributions", click "Date" and
enter "01/01/2016" in "From Date", then click "Search".

On the next page, click the dropdown next to "Export" and select
"CSV". A file named "ContributionsExpendituresSearchResult.csv" will
be downloaded. Move it to this directory. Then to fix the character
encoding and delete the first line (a title that comes before the
header line), run

    iconv -f UTF-16 -t UTF-8 ContributionsExpendituresSearchResult.csv | tail -n +2 > contributions.csv

Download committees
===================

Go to https://efiling.ocf.dc.gov/Disclosure and select "Principle
Campaign Committee" and the election year, then click "Search".
Click the dropdown next to "Export" and select "CSV". A file named
"RegistrantDisclosureSearchResult.csv" will
be downloaded. Move it to this directory. Then to fix the character
encoding and delete the first line (a title that comes before the
header line), run

    iconv -f UTF-16 -t UTF-8 RegistrantDisclosureSearchResult.csv | tail -n +2 > committees.csv
