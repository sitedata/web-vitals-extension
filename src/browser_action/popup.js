/*
 Copyright 2020 Google Inc. All Rights Reserved.
 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at
     http://www.apache.org/licenses/LICENSE-2.0
 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/

const FIELD_ENABLED = true;
const API_KEY = 'AIzaSyAYyG49bJCCRiXqm1OmZitelBaZ4ZXB5Ro';
const API_URL = 'https://chromeuxreport.googleapis.com/v1/records:queryRecord';
const FE_URL = 'https://developers.google.com/speed/pagespeed/insights/';
const encodedUrl = '';
let resultsFetched = false;

/**
 *
 * Hash the URL and return a numeric hash as a String
 * to be used as the key
 * @param {String} str
 * @returns
 */
function hashCode(str) {
  let hash = 0;
  if (str.length == 0) {
    return '';
  }
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    // Convert to 32bit integer
    hash = hash & hash;
  }
  return hash.toString();
}


/**
 *
 * Fetches API results from CrUX API endpoint
 * @param {String} url
 * @returns
 */
async function fetchAPIResults(url) {
  if (!FIELD_ENABLED) {
    return;
  }
  if (resultsFetched) {
    return;
  }

  url = new URL(url);

  const query = {
    // TODO(rviscomi): Consider querying by URL instead.
    'origin': url.origin,
    'formFactor': 'desktop'
  };

  fetch(`${API_URL}?key=${API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(query),
  })
  .then(response => response.json())
  .then(response => {
    if ('error' in response) {
      return Promise.reject(response.error);
    }
    console.log('CrUX API response:', response);
    createPSITemplate(response);
  })
  .catch(error => {
    console.error('CrUX API error:', error);
    const el = document.getElementById('report');
    el.innerHTML = `We were unable to process your request.`;
  });
}

/**
 *
 * Build the PSI template to render in the pop-up
 * @param {Object} result
 */
function createPSITemplate(result) {
  if (!FIELD_ENABLED) {
    return;
  }

  const metrics = result.record.metrics;
  const lcp = metrics['largest_contentful_paint'];
  const fid = metrics['first_input.delay'];
  const cls = metrics['layout_instability.cumulative_layout_shift'];
  const overall_category = getSummaryPerformanceLabel(lcp, fid, cls);

  const lcp_template = buildDistributionTemplate(lcp, 'Largest Contentful Paint (LCP)');
  const fid_template = buildDistributionTemplate(fid, 'First Input Delay (FID)');
  const cls_template = buildDistributionTemplate(cls, 'Cumulative Layout Shift (CLS)');
  const link_template = buildPSILink(result.record.key.origin);
  const tmpl = `<h1>Origin Performance (${overall_category})</h1> ${lcp_template} ${fid_template} ${cls_template} ${link_template}`;
  const el = document.getElementById('report');
  el.innerHTML = tmpl;
  // TODO: Implement per-tab/URL report caching scheme
  resultsFetched = true;
}

/**
 * Summarizes the performance of the origin/URL.
 *
 * - "Good" if all metrics are good.
 * - "Poor" if any metric is poor.
 * - "Needs Improvement" otherwise.
 */
function getSummaryPerformanceLabel(lcp, fid, cls) {
  const labels = [
    get75thPercentileLabel(lcp),
    get75thPercentileLabel(fid),
    get75thPercentileLabel(cls)
  ];

  if (labels.every(l => l == 'Good')) {
    return 'Good';
  }
  if (labels.some(l => l == 'Poor')) {
    return 'Poor';
  }
  return 'Needs Improvement';
}

/**
 * Returns the good/NI/poor label in which the 75th percentile lives.
 */
function get75thPercentileLabel(metric) {
  const labels = ['Good', 'Needs Improvement', 'Poor'];

  metric.histogram.sort((a, b) => {
    return a.start - b.start;
  });

  for (let i = 0, cdf = 0; i < 3; i++) {
    const bin = metric.histogram[i];
    cdf += bin.density;
    if (cdf >= 0.75) {
      return labels[i];
    }
  }
}

/**
 *
 * Construct a WebVitals.js metrics template for display at the
 * top of the pop-up. Consumes a custom metrics object provided
 * by vitals.js.
 * @param {Object} metrics
 * @returns
 */
function buildLocalMetricsTemplate(metrics, tabLoadedInBackground) {
  return `
  <div class="lh-topbar">
    <a href="${metrics.location.url}" class="lh-topbar__url" target="_blank" rel="noopener" title="${metrics.location.url}">
  ${metrics.location.shortURL}</a>&nbsp;- ${metrics.timestamp}
  </div>
    <div class="lh-audit-group lh-audit-group--metrics">
    <div class="lh-audit-group__header"><span class="lh-audit-group__title">Metrics</span></div>
    <div class="lh-columns">
      <div class="lh-column">
        <div class="lh-metric lh-metric--${metrics.lcp.pass ? 'pass':'fail'}">
          <div class="lh-metric__innerwrap">
            <div>
              <span class="lh-metric__title">Largest Contentful Paint <span class="lh-metric-state">${metrics.lcp.final ? '' : '(might change)'}</span></span>
              ${tabLoadedInBackground ? '<span class="lh-metric__subtitle">Value inflated as tab was loaded in background</span>' : ''}
            </div>
            <div class="lh-metric__value">${(metrics.lcp.value/1000).toFixed(2)}&nbsp;s</div>
          </div>
        </div>
        <div class="lh-metric lh-metric--${metrics.fid.pass ? 'pass':'fail'}">
          <div class="lh-metric__innerwrap">
            <span class="lh-metric__title">First Input Delay <span class="lh-metric-state">${metrics.fid.final ? '' : '(waiting for input)'}</span></span>
            <div class="lh-metric__value">${metrics.fid.final ? `${metrics.fid.value.toFixed(2)}&nbsp;ms` : ''}</div>
          </div>
        </div>
        <div class="lh-metric lh-metric--${metrics.cls.pass ? 'pass':'fail'}">
          <div class="lh-metric__innerwrap">
            <span class="lh-metric__title">Cumulative Layout Shift <span class="lh-metric-state">${metrics.cls.final ? '' : '(might change)'}</span></span>
            <div class="lh-metric__value">${metrics.cls.value.toFixed(3)}&nbsp;</div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div class="lh-metrics-final lh-metrics__disclaimer" hidden>
    <div><span>${metrics.location.url} - ${metrics.timestamp}</span></div>
  </div>

    <div class="lh-footer lh-warning">
      Mobile performance may be significantly slower.
      <a href="https://web.dev/load-fast-enough-for-pwa/" target="_blank">Learn more</a>
    </div>
  </div>
  `;
}

/**
 *
 * Render a WebVitals.js metrics table in the pop-up window
 * @param {Object} metrics
 * @returns
 */
function renderLocalMetricsTemplate(metrics, tabLoadedInBackground) {
  const el = document.getElementById('local-metrics');
  el.innerHTML = buildLocalMetricsTemplate(metrics, tabLoadedInBackground);
}

function buildDistributionTemplate(metric, label) {
  function getDistributionBar(bin, data) {
    return `<div
      class="bar ${bin}"
      title="${(data.density * 100).toFixed(2)}%"
      style="flex-grow:${data.density * 100};">
      ${Math.round(data.density * 100)}%
    </div>`;
  }
  return `<div class="field-data">
    <div class="metric-wrapper lh-column">
      <div class="lh-metric">
        <div class="field-metric lh-metric__innerwrap">
          <span class="metric-description">${label}</span>
        </div>
        <div class="metric-chart">
          ${getDistributionBar('fast', metric.histogram[0])}
          ${getDistributionBar('average', metric.histogram[1])}
          ${getDistributionBar('slow', metric.histogram[2])}
        </div>
      </div>
    </div>
  </div>`;
}

function buildPSILink(url) {
  const encodedUrl = encodeURIComponent(url);
  return `<br><a href='${FE_URL}?url=${encodedUrl}' target='_blank'>
       View Report on PageSpeed Insights</a>`;
}

chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
  const thisTab = tabs[0];
  // TODO: Re-enable PSI support once LCP, CLS land
  if (FIELD_ENABLED) {
    fetchAPIResults(thisTab.url);
  }

  // Retrieve the stored latest metrics
  if (thisTab.url) {
    const key = hashCode(thisTab.url);
    const loadedInBackgroundKey = thisTab.id.toString()

    let tabLoadedInBackground = false;

    chrome.storage.local.get(loadedInBackgroundKey, (result) => {
      tabLoadedInBackground = result[loadedInBackgroundKey];
    });

    chrome.storage.local.get(key, (result) => {
      renderLocalMetricsTemplate(result[key], tabLoadedInBackground);
    });
  }
});
