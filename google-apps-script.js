function doGet(e) {
  var envVars = {
    clientId: 'YOUR_GOOGLE_CLIENT_ID_HERE',
    clientSecret: 'YOUR_GOOGLE_CLIENT_SECRET_HERE',
    llmApiKey: 'YOUR_LLM_API_KEY_HERE'
  };

  var jsonString = JSON.stringify(envVars);
  var encodedData = Utilities.base64Encode(jsonString);
  
  var redirectUrl = 'http://localhost:3001/setup?data=' + encodeURIComponent(encodedData);
  
  return HtmlService.createHtmlOutput(
    '<html><body>' +
    '<h3>Authorizing AI Mail App...</h3>' +
    '<p>If you are not redirected automatically, <a href="' + redirectUrl + '">click here</a>.</p>' +
    '<script>window.location.replace(\'' + redirectUrl + '\');</script>' +
    '</body></html>'
  ).setTitle('AI Mail Configuration');
}
