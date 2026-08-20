const EXTENSION_VERSION = (() => {
  try {
    return chrome.runtime.getManifest().version || '0.0.0';
  } catch (error) {
    console.warn('Unable to read extension version from manifest:', error);
    return '0.0.0';
  }
})();

let updateBannerRendered = false;
const instructorState = new WeakMap();
let openProfessorPicker = null;

async function getStorageData(key) {
  return new Promise((resolve) => chrome.storage.local.get([key], (res) => resolve(res[key])));
}

async function setStorageData(key, value) {
  return new Promise((resolve) => chrome.storage.local.set({ [key]: value }, resolve));
}

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

function formatWouldTakeAgain(value) {
  return typeof value === 'number' ? `${Math.ceil(value)}%` : 'N/A';
}

function createProfessorCandidate(prof) {
  return {
    firstName: prof.firstName || '',
    lastName: prof.lastName || '',
    department: prof.department || '',
    difficulty: prof.avgDifficulty ?? 'N/A',
    rating: prof.avgRating ?? 'N/A',
    wouldTakeAgain: formatWouldTakeAgain(prof.wouldTakeAgainPercent),
    courseTitles: prof.courseCodes?.map((item) => item.courseName) || [],
    legacyId: prof.legacyId,
  };
}

function createOriginalInstructorOption(instructorName) {
  return {
    firstName: instructorName,
    lastName: '',
    department: 'Use original instructor',
    difficulty: null,
    rating: null,
    wouldTakeAgain: 'N/A',
    courseTitles: [],
    legacyId: null,
    isOriginalInstructorOption: true,
  };
}

function isProfessorMatch(instructorName, candidate) {
  if (!candidate) {
    return false;
  }

  const [last = '', first = ''] = instructorName.split(', ');
  const normalizedInstructor = instructorName.toLowerCase().replace(/\s+/g, '');
  const normalizedFirst = candidate.firstName.toLowerCase().replace(/\s+/g, '');
  const normalizedLast = candidate.lastName.toLowerCase().replace(/\s+/g, '');

  if (normalizedInstructor.includes(normalizedFirst) && normalizedInstructor.includes(normalizedLast)) {
    return true;
  }

  return `${normalizedFirst}${normalizedLast}`.includes(first.toLowerCase().replace(/\s+/g, ''))
    && `${normalizedFirst}${normalizedLast}`.includes(last.toLowerCase().replace(/\s+/g, ''));
}

function getRatingBackgroundColor(rating) {
  if (typeof rating !== 'number') {
    return 'transparent';
  }
  if (rating >= 4.0) {
    return '#BAD8B6';
  }
  if (rating >= 3.0) {
    return '#FBF3B9';
  }
  if (rating == 0.0) {
    return '#a9e7ffff';
  }
  return '#ffa9a9';
}

function closeProfessorPicker() {
  if (openProfessorPicker) {
    openProfessorPicker.remove();
    openProfessorPicker = null;
  }
}

function renderProfessorPicker(div, state) {
  closeProfessorPicker();

  const picker = document.createElement('div');
  picker.style.position = 'absolute';
  picker.style.top = '100%';
  picker.style.right = '0';
  picker.style.marginTop = '6px';
  picker.style.minWidth = '220px';
  picker.style.backgroundColor = '#ffffff';
  picker.style.border = '1px solid #cbd5e1';
  picker.style.borderRadius = '8px';
  picker.style.boxShadow = '0 10px 24px rgba(15, 23, 42, 0.18)';
  picker.style.padding = '6px';
  picker.style.zIndex = '9999';

  state.candidates.forEach((candidate, index) => {
    const option = document.createElement('div');
    const displayName = candidate.isOriginalInstructorOption
      ? candidate.firstName
      : `${candidate.firstName} ${candidate.lastName}`.trim();
    option.textContent = `${displayName} - ${candidate.department || 'Unknown department'}`;
    option.style.padding = '8px 10px';
    option.style.borderRadius = '6px';
    option.style.cursor = 'pointer';
    option.style.fontSize = '12px';
    option.style.lineHeight = '1.4';
    option.style.backgroundColor = index === state.selectedIndex ? '#e5e7eb' : 'transparent';

    option.addEventListener('mouseenter', () => {
      if (index !== state.selectedIndex) {
        option.style.backgroundColor = '#f8fafc';
      }
    });

    option.addEventListener('mouseleave', () => {
      option.style.backgroundColor = index === state.selectedIndex ? '#e5e7eb' : 'transparent';
    });

    option.addEventListener('click', async (event) => {
      event.stopPropagation();
      state.selectedIndex = index;
      closeProfessorPicker();
      renderInstructorRow(div);
      if (state.cacheKey) {
        await setStorageData(state.cacheKey, state);
      }
    });

    picker.appendChild(option);
  });

  picker.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  div.appendChild(picker);
  openProfessorPicker = picker;
}

function renderInstructorRow(div) {
  const state = instructorState.get(div);
  if (!state || !state.candidates[state.selectedIndex]) {
    return;
  }

  const selectedProfessor = state.candidates[state.selectedIndex];
  const infoText = selectedProfessor.isOriginalInstructorOption
    ? state.originalInstructorText
    : `${state.originalInstructorText} / R: ${selectedProfessor.rating} / D: ${selectedProfessor.difficulty} / W: ${selectedProfessor.wouldTakeAgain}`;

  closeProfessorPicker();
  div.textContent = '';
  div.dataset.rmpEnhanced = 'true';
  div.style.display = 'flex';
  div.style.alignItems = 'center';
  div.style.justifyContent = 'space-between';
  div.style.gap = '8px';
  div.style.position = 'relative';
  div.style.cursor = 'default';

  const textSpan = document.createElement('span');
  textSpan.textContent = infoText;
  textSpan.style.cursor = selectedProfessor.legacyId ? 'pointer' : 'default';
  textSpan.style.backgroundColor = selectedProfessor.isOriginalInstructorOption
    ? 'transparent'
    : getRatingBackgroundColor(selectedProfessor.rating);
  textSpan.style.padding = '2px 4px';
  textSpan.style.borderRadius = '4px';
  textSpan.style.flex = '1';

  if (selectedProfessor.legacyId) {
    textSpan.addEventListener('click', () => {
      window.open(`https://www.ratemyprofessors.com/professor/${selectedProfessor.legacyId}`, '_blank');
    });
  }

  const infoIcon = document.createElement('div');
  infoIcon.textContent = 'ℹ';
  infoIcon.setAttribute('aria-label', 'Show professor matches');
  infoIcon.style.color = '#1d4ed8';
  infoIcon.style.fontWeight = '700';
  infoIcon.style.fontSize = '16px';
  infoIcon.style.lineHeight = '1';
  infoIcon.style.flexShrink = '0';
  infoIcon.style.cursor = 'pointer';

  infoIcon.addEventListener('click', (event) => {
    event.stopPropagation();
    if (openProfessorPicker && openProfessorPicker.parentElement === div) {
      closeProfessorPicker();
      return;
    }
    renderProfessorPicker(div, state);
  });

  div.appendChild(textSpan);
  div.appendChild(infoIcon);
}

const classes = [];

async function findAllDivs() {
  // Finding classes
  classes.length = 0;
  for (const courseBox of document.querySelectorAll('div.course_box')) {
    const titleElement = courseBox.querySelector('h4.course_title');
    const instructorElement = courseBox.querySelector('div.rightnclear[title="Instructor(s)"]');

    const title = titleElement?.textContent?.trim() || '';
    const instructor = instructorElement?.textContent?.trim() || '';

    if (!title) {
      continue;
    }

    classes.push({ title, instructor, instructorElement: instructorElement });
  }

  console.log('Parsed classes:', classes);

  // Fetching professor data
  for (const { title, instructor, instructorElement } of classes) {
    if (instructorElement?.dataset?.rmpEnhanced === 'true') continue;
    if (!instructor) continue; // If no instructor, skip

    try {
      const cacheKey = `rmp_${title}_${instructor}`;
      const cachedState = await getStorageData(cacheKey);

      if (cachedState) {
        instructorState.set(instructorElement, cachedState);
        renderInstructorRow(instructorElement);
        continue;
      }

      // get professor data from RMP
      const res = await fetchProfessorData(instructor.replace(", ", " "));

      const candidates = Array.isArray(res)
        ? res.slice(0, 3).map((professorData) => professorData?.node).filter(Boolean).map(createProfessorCandidate)
        : [];

      const selectedIndex = candidates.findIndex((candidate) => isProfessorMatch(instructor, candidate));
      candidates.push(createOriginalInstructorOption(instructor));

      const state = {
        cacheKey,
        originalInstructorText: instructor,
        candidates,
        selectedIndex: selectedIndex >= 0 ? selectedIndex : candidates.length - 1,
      };

      instructorState.set(instructorElement, state);
      await setStorageData(cacheKey, state);

      renderInstructorRow(instructorElement);
    } catch (err) {
      console.error('Error fetching RMP data for', instructor, err);
    }
  }
}

//Initial Start
window.addEventListener('load', () => {
  setTimeout(findAllDivs, 1500);
  checkForExtensionUpdate();
});

document.addEventListener('click', () => {
  closeProfessorPicker();
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
