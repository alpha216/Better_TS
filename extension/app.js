const EXTENSION_VERSION = (() => {
  try {
    return chrome.runtime.getManifest().version || '0.0.0';
  } catch (error) {
    console.warn('Unable to read extension version from manifest:', error);
    return '0.0.0';
  }
})();

let updateBannerRendered = false;

async function fetchProfessorData(name) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        action: "fetchProfessorData",
        profName: name
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("RMP Error (message passing):", chrome.runtime.lastError.message);
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (response && response.success) {
          resolve(response.data);
        } else {
          console.warn("RMP Warning (background fetch):", response ? response.error : `No data for ${name}`);
          resolve(null); // return null if no data found
        }
      }
    );
  });
}

function updateDiv(prof, div) {
  const rating = prof.avgRating ?? 'N/A';
  const difficulty = prof.avgDifficulty ?? 'N/A';
  div.textContent = `${div.textContent.trim()} / R: ${rating} / D: ${difficulty} / W: ${Math.ceil(prof.wouldTakeAgainPercent) ?? 'N/A'}%`;
  if(prof.avgRating >= 4.0) {
    div.style.backgroundColor = '#BAD8B6';
  }
  else if(prof.avgRating >= 3.0) {
    div.style.backgroundColor = '#FBF3B9';
  }
  else if(prof.avgRating < 3.0) {
    div.style.backgroundColor = '#ffa9a9';
  }
  div.style.cursor = 'pointer';
  div.addEventListener('click', function() {
    window.open('https://www.ratemyprofessors.com/professor/'+prof.legacyId, '_blank');
  });
};

async function findAllDivs() {
  const instructorDivs = document.querySelectorAll('div.rightnclear[title="Instructor(s)"]');
  for (const div of instructorDivs) {
    const originalName = div.textContent.trim();
    if (originalName.includes(' / R:')) continue; // If rate exist, Do not repeat
    if (!originalName) continue;

    try {
      const res = await fetchProfessorData(originalName.replace(", ", " "));
      const prof = res[0].node
      const first = originalName.split(", ")[1]
      const last = originalName.split(", ")[0]
      if(!originalName.includes(prof.firstName) || !originalName.includes(prof.lastName)) {
        if(!(prof.firstName + prof.lastName).includes(first) || !(prof.firstName + prof.lastName).includes(last)){
          console.log('Name mismatch:', originalName, prof.firstName, prof.lastName);
          // injectModals(div, res);
          continue; // Skip if names do not match
        }
      }
      if (prof) {
        updateDiv(prof, div);
      }
    } catch (err) {
      console.error('Error fetching RMP data for', originalName, err);
    }
  }
}

//Initial Start
window.addEventListener('load', () => {
  setTimeout(findAllDivs, 1500);
  checkForExtensionUpdate();
});

const legendBox = document.getElementById('legend_box');

let observer = new MutationObserver(() => {
  console.log('DOM changed');
  findAllDivs();
});

observer.observe(legendBox, {
        attributes: true,          
        attributeOldValue: true,  

        childList: true,           

        // subtree: true,             

        characterData: true,       
        characterDataOldValue: true 
});

function requestLatestExtensionVersion() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { action: "fetchLatestVersion" },
      (response) => {
        if (chrome.runtime.lastError) {
          console.warn('Version check runtime error:', chrome.runtime.lastError.message);
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (response && response.success && typeof response.version === 'string') {
          resolve(response.version);
        } else {
          reject(new Error(response?.error || 'Unknown version check failure'));
        }
      }
    );
  });
}

function compareSemanticVersions(left, right) {
  const leftParts = left.split('.').map((part) => parseInt(part, 10) || 0);
  const rightParts = right.split('.').map((part) => parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;
    if (leftValue > rightValue) {
      return 1;
    }
    if (leftValue < rightValue) {
      return -1;
    }
  }
  return 0;
}

function renderUpdateBanner(newVersion) {
  if (updateBannerRendered) {
    return;
  }

  const banner = document.createElement('div');
  banner.id = 'tigerScheduleUpdateBanner';
  banner.style.position = 'fixed';
  banner.style.bottom = '24px';
  banner.style.right = '24px';
  banner.style.zIndex = '2147483647';
  banner.style.background = '#14233c';
  banner.style.color = '#ffffff';
  banner.style.padding = '14px 18px';
  banner.style.borderRadius = '10px';
  banner.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.35)';
  banner.style.display = 'flex';
  banner.style.alignItems = 'center';
  banner.style.gap = '12px';
  banner.style.fontFamily = 'Arial, sans-serif';
  banner.style.fontSize = '14px';

  const message = document.createElement('span');
  message.textContent = `Update available: v${newVersion}`;

  const link = document.createElement('a');
  link.href = 'https://alpha216.github.io/BettertigerSchedule/';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Open site';
  link.style.color = '#86c5ff';
  link.style.fontWeight = '600';
  link.style.textDecoration = 'underline';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.textContent = 'X';
  closeButton.setAttribute('aria-label', 'Dismiss update notification');
  closeButton.style.marginLeft = '8px';
  closeButton.style.background = 'transparent';
  closeButton.style.border = 'none';
  closeButton.style.color = '#ffffff';
  closeButton.style.fontSize = '16px';
  closeButton.style.cursor = 'pointer';
  closeButton.style.fontWeight = '600';

  closeButton.addEventListener('click', () => {
    banner.remove();
    updateBannerRendered = false;
  });

  banner.appendChild(message);
  banner.appendChild(link);
  banner.appendChild(closeButton);

  document.body.appendChild(banner);
  updateBannerRendered = true;
}

async function checkForExtensionUpdate() {
  try {
    const newestVersion = await requestLatestExtensionVersion();
    if (compareSemanticVersions(newestVersion, EXTENSION_VERSION) > 0) {
      renderUpdateBanner(newestVersion);
    }
  } catch (error) {
    console.info('Extension update check skipped:', error.message);
  }
}