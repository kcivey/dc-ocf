<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
  <title>DC 2020 Candidates</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/twitter-bootstrap/4.3.1/css/bootstrap.min.css" integrity="sha256-YLGeXaapI0/5IgZopewRJcFXomhRMlYYjugPLSyNjTY=" crossorigin="anonymous" />
  <style type="text/css">
    #candidate-table th.election-head {
      background-color: #44d;
      color: white;
      text-align: left;
      font-size: 1.2rem;
    }
    #candidate-table th.party-head {
      background-color: #ccf;
      text-align: left;
    }
    #candidate-table th.office-head {
      text-align: left;
      padding-left: 1.75rem;
    }
    #candidate-table td:first-child {
      padding-left: 2.75rem;
    }
    #candidate-table tr+tr > th.election-head {
      border-top: 4rem solid white;
    }
  </style>
</head>
<body>
<table id="candidate-table" class="table">
  <thead>
    <tr>
      <th>Candidate</th>
      <th>Website</th>
      <th>Twitter</th>
      <th>OCF<br>Filing</th>
      <th>Phone</th>
      <th>Email</th>
      <th>Address</th>
      <th>Zip</th>
    </tr>
  </thead>
  <tbody>
    <%for (const [election, records] of Object.entries(recordsByElection)) { %>
      <tr>
        <th class="election-head" colspan="8"><%- election %></th>
      </tr>
      <% for (const [party, candidatesByOffice] of Object.entries(records)) { %>
        <tr>
          <th class="party-head" colspan="8"><%- party %></th>
        </tr>
        <% for (const [office, candidates] of Object.entries(candidatesByOffice)) { %>
          <tr>
            <th class="office-head" colspan="8"><%- office %></th>
          </tr>
          <% for (const c of candidates) { %>
            <tr>
              <td><%- c.candidate_name %></td>
              <td>
                <% if (c.website) { %>
                  <a href="https://<%- c.website %>"><%- c.website %></a>
                <% } %>
              </td>
              <td>
                <% if (c.twitter) { %>
                  <a href="https://twitter.com/<%- c.twitter %>">@<%- c.twitter %></a>
                <% } %>
              </td>
              <td><%- c.filing_date %></td>
              <td><%- c.committee_phone %></td>
              <td><%- c.email %></td>
              <td><%- c.address %></td>
              <td><%- c.zip %></td>
            </tr>
          <% } %>
        <% } %>
      <% } %>
    <% } %>
  </tbody>
</table>
<%= '\x3c%= nav %\x3e' %>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.4.1/jquery.min.js" integrity="sha256-CSXorXvZcTkaix6Yvo6HppcZGetbYMGWSFlBw8HfCJo=" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/popper.js/1.15.0/umd/popper.min.js" integrity="sha256-fTuUgtT7O2rqoImwjrhDgbXTKUwyxxujIMRIK7TbuNU=" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/twitter-bootstrap/4.3.1/js/bootstrap.min.js" integrity="sha256-CjSoeELFOcH0/uxWu6mC/Vlrc1AARqbm/jiiImDGV3s=" crossorigin="anonymous"></script>
</body>
</html>
