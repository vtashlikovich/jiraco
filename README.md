# Jiraco

Library for gathering worklogs for a user in a certain period of time

## Requirements
- MAX_ISSUES - environment variable - max issues to load for a request. 200 is a good value;
- DEBUG - environment variable - use =1 to get more logs;
- constants - contains regexp which used to filter out the comments after taking them from the server.

## Usage
```
var jiracoModule = require('./jiraco/');
...
jiracoModule.collectReport([startDate, endDate, jiraUserAccountName, jiraProjectURL, jiraProjectIssueKey, jiraProjectAPIKey, jiraUserAccountID])
        .then(logStorage => {
            ...
        });
```

__logStorage__ contains Array of objects:
```
{
    date: "YYYYMMDD",
    logtime: "HH:MM",
    key: "PROJECTKEY-100",
    title: "Title of the issue",
    user: "User display name",
    userid: "User account name",
    timespent: "100000", // time spent in milliseconds
    comment: "LOG COMMENT"
}
```
