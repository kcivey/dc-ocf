<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
  <title>DC 2020 Candidates</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/twitter-bootstrap/4.3.1/css/bootstrap.min.css" integrity="sha256-YLGeXaapI0/5IgZopewRJcFXomhRMlYYjugPLSyNjTY=" crossorigin="anonymous" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.8.1/css/all.min.css" integrity="sha256-7rF6RaSKyh16288E3hVdzQtHyzatA2MQRGu0cf6pqqM=" crossorigin="anonymous">
  <link rel="stylesheet" href="/index.css">
  <style type="text/css">
    #candidate-table {
      width: auto;
      background-color: white;
      color: black;
      border: 1px solid #dee2e6;
    }
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
    tr.details td {
      border-top: none;
    }
    tr.spacer td {
      height: 4rem;
      background: ivory;
      border-left: 1px solid ivory;
      border-right: 1px solid ivory;
    }
    tr.column-heads th {
      vertical-align: bottom;
    }
    #table-container {
      max-width: 100%;
      overflow-x: scroll;
    }
  </style>
</head>
<body>
<div class="container-fluid">
  <div class="row">
    <div class="col-12">
      <h1>DC 2020 Candidates</h1>
      <div id="table-container">
        <table id="candidate-table" class="table">
        <tbody>
          <% let i = 0, cols = 8 %>
          <%for (const [election, records] of Object.entries(recordsByElection)) { %>
            <% if (i) { %>
              <tr class="spacer">
                <td colspan="<%= cols %>"></td>
              </tr>
            <% }%>
            <tr class="column-heads">
              <th>Candidate</th>
              <th>Website</th>
              <th>Twitter</th>
              <th>OCF<br>Filing</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Address</th>
              <th>Zip</th>
              <!-- <th></th> -->
            </tr>
            <tr>
              <th class="election-head" colspan="<%= cols %>"><%- election %></th>
            </tr>
            <% for (const [party, candidatesByOffice] of Object.entries(records)) { %>
              <tr>
                <th class="party-head" colspan="<%= cols %>"><%- party %></th>
              </tr>
              <% for (const [office, candidates] of Object.entries(candidatesByOffice)) { %>
                <tr>
                  <th class="office-head" colspan="<%= cols %>"><%- office %></th>
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
                    <!-- <td><button data-toggle="collapse" data-target="#details-<%= i %>">Details</button></td> -->
                  </tr>
                  <!-- <tr id="details-<%= i%>" class="collapse details"><td colspan="<%= cols %>">Details</td></tr> -->
                  <% i++ %>
                <% } %>
              <% } %>
            <% } %>
          <% } %>
        </tbody>
      </table>
      </div>
    </div>
  </div>
</div>
<%= '\x3c%= nav %\x3e' %>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.4.1/jquery.min.js" integrity="sha256-CSXorXvZcTkaix6Yvo6HppcZGetbYMGWSFlBw8HfCJo=" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/popper.js/1.15.0/umd/popper.min.js" integrity="sha256-fTuUgtT7O2rqoImwjrhDgbXTKUwyxxujIMRIK7TbuNU=" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/twitter-bootstrap/4.3.1/js/bootstrap.min.js" integrity="sha256-CjSoeELFOcH0/uxWu6mC/Vlrc1AARqbm/jiiImDGV3s=" crossorigin="anonymous"></script>
</body>
</html>
