var requestPromise = require('request-promise');
var Constants = require('../constants');
var dateFormat = require('dateformat');

/**
 * Collecting the report for user and period of days
 * @param inParameters {array} - [dateFrom, dateTo, reportAuthor, ...]
 * dateFrom {string} - period start, YYYY-MM-DD
 * dateTo {string} - period end
 * reportAuthorNickname {string} - report user or empty for all users
 * projectURL {string} - Jira project URL
 * projectIssueKey {string} - Jira project system title/key
 * projectAPIKey {string} - Jira API key
 * reportAuthorJiraAccountID {string} - Jira user account ID
 * @return {array} - log storage
 */
module.exports.collectReport = function(inParameters) {

	var [dateFrom, dateTo, reportAuthorNickname, projectURL, projectIssueKey, 
		projectAPIKey, reportAuthorJiraAccountID] = inParameters;

	var requestHeaderData = {
	    Authorization: "Basic " + projectAPIKey,
	    "Content-Type": "application/json"
	}
	
	return new Promise((resolve, reject) => {
		var reportWorklogsArray = [];

		console.log('collectReport for', reportAuthorNickname, reportAuthorJiraAccountID, dateFrom, dateTo);

		// get a list of recently changed issues using JQL
		var jqlString = (projectIssueKey?("project = " + projectIssueKey + " AND "):"") + " updated > 0 and " +
				"updatedDate >= \"" + dateFrom + "\" and worklogDate >= \"" + dateFrom + "\"" +
				(reportAuthorNickname?(" and worklogAuthor = \"" + (reportAuthorJiraAccountID?reportAuthorJiraAccountID:reportAuthorNickname) + "\""):"");
		console.log(jqlString);

		requestPromise({
		  "method":"POST",
		  "uri": projectURL + "/rest/api/2/search",
		  "json": true,
		  "headers": requestHeaderData,
		  "body": {
		        jql: jqlString,
		        maxResults: parseInt(process.env.MAX_ISSUES)
		    }
		})
		.then((searchResult) => {
		    console.log('Count for', reportAuthorNickname, '= ', searchResult.issues.length);

		    var issuesArray = [];
		    
		    // loop through issues
		    for (var resultIndex in searchResult.issues) {
		        var record = searchResult.issues[resultIndex];

		        console.log('= issue: ', record.key, 'for ', reportAuthorNickname);

		        issuesArray.push([record.key, 
		        	record.fields.summary, 
		        	dateFrom.replace(/\//g, ''), 
		        	dateTo.replace(/\//g, ''), 
		        	reportAuthorNickname,
		        	projectURL,
		        	projectIssueKey,
		        	projectAPIKey, reportAuthorJiraAccountID]);
		    };

		    return Promise.all(issuesArray.map(getWorklogs));
		})
		.then(jiraResults => {

		    // gather data in 1 general worklog
		    for (var jiraResultsIndex in jiraResults)
		        for (var worklogIndex in jiraResults[jiraResultsIndex])
		            reportWorklogsArray = reportWorklogsArray.concat(jiraResults[jiraResultsIndex][worklogIndex]);

		    // sort array by date, user, issue key
		    reportWorklogsArray.sort(worklogsSort);

		    console.log('job is done for', reportAuthorNickname, 'found: ', reportWorklogsArray.length);

		    resolve(reportWorklogsArray);
		})
		.catch(function (err) {
        	reject(new Error('Problems while connecting to Jira' + err));
    	});
	});
}

/**
 * Getting a worklog for the issue
 * @param  {array} record array with issue key + title
 * @return {Promise} array with worklogs found / error
 */
function getWorklogs(record) {

	var [issueKey, issueTitle, dateFrom, dateTo, logAuthorNickname, projectURL, ,
		projectAPIKey, logAuthorJiraAccountId] = record;

	var requestHeaderData = {
	    Authorization: "Basic " + projectAPIKey,
	    "Content-Type": "application/json"
	}

    return new Promise((resolve, reject) => {

        var requestArgs = {
            data: {},
            headers: requestHeaderData
		};
		
		// request for a work log
        client.get(projectURL + "/rest/api/2/issue/" + issueKey + "/worklog", 
            requestArgs, (data, response) => {

                if (data) {
					let localStorage = [];
					
					// loop for issue's worklog
                    for (var worklogIndex in data.worklogs) {

						var logItem = data.worklogs[worklogIndex];
						var logItemDateNumber = convertDateToNumber(logItem.started);

						if (process.env.DEBUG) {
							console.log("logitem.started = ", logItem.started);
							if (logAuthorNickname == logItem.author.name || logAuthorJiraAccountId == logItem.author.accountId)
								console.log('we gonna grab logItemDate = ', logItemDateNumber);
						}

						if (process.env.DEBUG)
							logItemData(logItemDateNumber, dateFrom, dateTo, logAuthorNickname, logItem, logAuthorJiraAccountId)

                        // take only worklog that suits our date period
						if (logItemSuitsCriteria(logItemDateNumber, dateFrom, dateTo, 
								logAuthorNickname, logAuthorJiraAccountId, logItem)) {

							if (process.env.DEBUG) {
								console.log('> efforts:', issueKey); console.log('init.', logItem.started); console.log('res.', logItemDateNumber);
							}

							var logItemStartedDate = new Date(logItem.started);
							logItemStartedDate = dateFormat(logItemStartedDate, "yyyymmdd, HH:MM:ss");
							var exportDate = logItemStartedDate.substring(0, 8);

							var exportItemArray = {
								date: exportDate,
								logtime: logItemStartedDate.substring(10),
                                key: issueKey,
                                title: "\"" + issueTitle.split("\r\n").join('') + "\"",
                                user: logItem.author.displayName,
                                userid: logAuthorNickname,
                                timespent: "\"" + (logItem.timeSpentSeconds / 3600) + "\"",
                                comment: ""
                            };

                            if (logItem.comment) {
                                var issueComment = filterComment(logItem.comment.split("\r\n").join(' '));
                                exportItemArray.comment = issueComment?issueComment.split("\n").join(' '):'';
                            }

                            localStorage.push(exportItemArray);
                        }
					} // for
					
					resolve(localStorage);
                }
                else
                    reject(new Error('No data from the server'));
            }); // client
    });
};

// === MISC ======================================================

function logItemSuitsCriteria(logItemDateNumber, dateFrom, dateTo, logAuthorNickname, logAuthorJiraAccountId, logItem) {
	return parseInt(logItemDateNumber) >= parseInt(dateFrom)
		&& (!dateTo || parseInt(logItemDateNumber) <= parseInt(dateTo))
		&& (logAuthorNickname && logAuthorNickname == logItem.author.name ||
			logAuthorJiraAccountId && logAuthorJiraAccountId == logItem.author.accountId);
}

function logItemData(logItemDateNumber, dateFrom, dateTo, logAuthorNickname, logItem, logAuthorJiraAccountId) {
	console.log('...');
	console.log('...');
	console.log('logItemDate >= parseInt(dateFrom ', parseInt(logItemDateNumber) >= parseInt(dateFrom));
	console.log('dateTo', dateTo);
	console.log('logItemDate <= dateTo', parseInt(logItemDateNumber) <= parseInt(dateTo));
	console.log('logAuthor', logAuthorNickname);
	console.log('logAuthor == logitem.author.name', logAuthorNickname == logItem.author.name);
	console.log('logAuthorAccountId', logAuthorJiraAccountId);
	console.log('logitem.author.accountId', logItem.author.accountId);
	console.log('logAuthorAccountId == logitem.author.accountId', logAuthorJiraAccountId == logItem.author.accountId);
}

function worklogsSort(record1, record2) {
	if (record1.date > record2.date)
		return 1;
	else if (record1.date < record2.date)
		return -1;

	if (record1.user > record2.user)
		return 1;
	else if (record1.user < record2.user)
		return -1;

	if (record1.key > record2.key)
		return 1;
	else if (record1.key < record2.key)
		return -1;

	return 0;
}

function filterComment(comment) {
	var filteredResult = comment.match(Constants.COMMENT_REGEXP);
	return filteredResult?filteredResult.join(''):'';
  }
  
  function convertDateToNumber(sourceDate) {
	  return dateFormat(new Date(sourceDate), "yyyymmdd");
  }