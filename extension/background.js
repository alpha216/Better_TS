
const GQL_QUERY = `query NewSearchTeachersQuery(
  $query: TeacherSearchQuery!
  $count: Int
) {
  newSearch {
    teachers(query: $query, first: $count) {
      didFallback
      edges {
        node {
          id
          legacyId
          avgRating
          avgDifficulty
          wouldTakeAgainPercent
          firstName
          lastName
          department
          departmentId
          courseCodes {
            courseCount
            courseName
          }
        }
      }
    }
  }
}
`;

async function fetchProfessorDataFromAPI(profName) {
  const variables = {
    query: {
      text: profName,
      schoolID: "U2Nob29sLTYw" // Auburn University RMP school ID
    },
    count: 3, // Return information for the top 3 matching professors
    includeCompare: true
  };

  try {
    const response = await fetch('https://api.ratemyprofessors.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: GQL_QUERY, variables })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`RMP API request failed for "${profName}" with status ${response.status}: ${errorBody}`);
      throw new Error(`API request failed: ${response.status}`);
    }

    const json = await response.json();

    if (json.errors) {
      console.error(`RMP API returned GraphQL errors for "${profName}":`, json.errors);
      throw new Error(`GraphQL error from RMP API`);
    }
    
    const edges = json.data?.newSearch?.teachers?.edges;
    if (!edges || edges.length === 0) {
      console.log(`No RMP data found for "${profName}"`);
      return null;
    }
    return edges;
  } catch (error) {
    console.error('Error fetching RMP data in background for', profName, ':', error);
    throw error; // Throw the error to be handled by the caller
  }
}

async function fetchLatestVersionFromAPI() {
  try {
    const response = await fetch('https://alpha216.github.io/Better_TS/api/newest', {
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`Version API request failed: ${response.status}`);
    }

    const payload = await response.json();
    const newest = payload?.newest;

    if (typeof newest !== 'string') {
      throw new Error('Version API response missing "newest" string');
    }

    return newest;
  } catch (error) {
    console.error('Error fetching latest extension version:', error);
    throw error;
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "fetchProfessorData") {
    fetchProfessorDataFromAPI(request.profName)
      .then(data => {
        sendResponse({ success: true, data: data });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true; 
  }
  if (request.action === "fetchLatestVersion") {
    fetchLatestVersionFromAPI()
      .then(version => {
        sendResponse({ success: true, version });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});