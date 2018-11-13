# SDQL Query Processor

Reads a list of SDQL queries from a file specified on the command line.  Then it will check each query for todays date to see if there are any teams or totals that match those queries.  List of matches can be sent to the specified email address.

## Query File Format
<Type of query>,<queryurl> 
  
Type of query:  Must be 'A', 'O', or 'U' which corresponds with 'Against the Spread', 'Over', and 'Under'
The query URL can be copied and pasted from sportsdatabase or killersports and should have any trailing "&submit=++S+D+Q+L+!++" string removed 
