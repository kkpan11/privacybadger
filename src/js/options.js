/*
 * This file is part of Adblock Plus <http://adblockplus.org/>,
 * Copyright (C) 2006-2013 Eyeo GmbH
 *
 * Adblock Plus is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * Adblock Plus is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Adblock Plus.  If not, see <http://www.gnu.org/licenses/>.
 */

window.OPTIONS_INITIALIZED = false;

const TOOLTIP_CONF = {
  maxWidth: 200
};
const USER_DATA_EXPORT_KEYS = ["action_map", "snitch_map", "settings_map"];

let i18n = chrome.i18n;

let constants = require("constants");
let { getOriginsArray } = require("optionslib");
let htmlUtils = require("htmlutils").htmlUtils;
let utils = require("utils");

let OPTIONS_DATA = {};

/*
 * Loads options from pb storage and sets UI elements accordingly.
 */
function loadOptions() {
  // Set page title to i18n version of "Privacy Badger Options"
  document.title = i18n.getMessage("options_title");

  // Add event listeners
  $("#allowlist-form").on("submit", addDisabledSite);
  $("#remove-disabled-site").on("click", removeDisabledSite);
  $("#cloud-upload").on("click", uploadCloud);
  $("#cloud-download").on("click", downloadCloud);
  $('#importTrackerButton').on("click", loadFileChooser);
  $('#importTrackers').on("change", importTrackerList);
  $('#exportTrackers').on("click", exportUserData);
  $('#resetData').on("click", resetData);
  $('#removeAllData').on("click", removeAllData);

  if (OPTIONS_DATA.showTrackingDomains) {
    $('#tracking-domains-overlay').hide();
  } else {
    $('#blockedResourcesContainer').hide();

    $('#show-tracking-domains-checkbox').on("click", () => {
      $('#tracking-domains-overlay').hide();
      $('#blockedResourcesContainer').show();
      chrome.runtime.sendMessage({
        type: "updateSettings",
        data: {
          showTrackingDomains: true
        }
      });
    });
  }

  // Set up input for searching through tracking domains.
  $("#trackingDomainSearch").on("input", filterTrackingDomains);
  $("#tracking-domains-type-filter").on("change", filterTrackingDomains);
  $("#tracking-domains-status-filter").on("change", filterTrackingDomains);
  $("#tracking-domains-show-not-yet-blocked").on("change", filterTrackingDomains);

  // Add event listeners for origins container.
  $('#blockedResourcesContainer').on('change', 'input:radio', function () {
    let $radio = $(this),
      $clicker = $radio.parents('.clicker').first(),
      origin = $clicker.data('origin'),
      action = $radio.val();

    // update domain slider row tooltip/status indicators
    updateOrigin(origin, action, true);

    // persist the change
    saveToggle(origin, action);
  });
  $('#blockedResourcesContainer').on('click', '.userset .honeybadgerPowered', revertDomainControl);
  $('#blockedResourcesContainer').on('click', '.removeOrigin', removeOrigin);

  // Display jQuery UI elements
  $("#tabs").tabs({
    activate: function (event, ui) {
      // update options page URL fragment identifier
      // to preserve selected tab on page reload
      history.replaceState(null, null, "#" + ui.newPanel.attr('id'));
    }
  });
  $("button").button();
  $("#add-disabled-site").button("option", "icons", {primary: "ui-icon-plus"});
  $("#remove-disabled-site").button("option", "icons", {primary: "ui-icon-minus"});
  $("#cloud-upload").button("option", "icons", {primary: "ui-icon-arrowreturnthick-1-n"});
  $("#cloud-download").button("option", "icons", {primary: "ui-icon-arrowreturnthick-1-s"});
  $(".importButton").button("option", "icons", {primary: "ui-icon-plus"});
  $("#exportTrackers").button("option", "icons", {primary: "ui-icon-extlink"});
  $("#resetData").button("option", "icons", {primary: "ui-icon-arrowrefresh-1-w"});
  $("#removeAllData").button("option", "icons", {primary: "ui-icon-closethick"});
  $("#show_counter_checkbox").on("click", updateShowCounter);
  $("#show_counter_checkbox").prop("checked", OPTIONS_DATA.showCounter);
  $("#replace-widgets-checkbox")
    .on("click", updateWidgetReplacement)
    .prop("checked", OPTIONS_DATA.isWidgetReplacementEnabled);
  $("#enable_dnt_checkbox").on("click", updateDNTCheckboxClicked);
  $("#enable_dnt_checkbox").prop("checked", OPTIONS_DATA.isDNTSignalEnabled);
  $("#check_dnt_policy_checkbox").on("click", updateCheckingDNTPolicy);
  $("#check_dnt_policy_checkbox").prop("checked", OPTIONS_DATA.isCheckingDNTPolicyEnabled).prop("disabled", !OPTIONS_DATA.isDNTSignalEnabled);
  $("#alternateErrorPagesEnabled_checkbox").on("click", toggleAlternateErrorPagesSetting);
  $("#alternateErrorPagesEnabled_checkbox").prop("checked", OPTIONS_DATA.isAlternateErrorPagesEnabled);
  $("#hyperlinkAuditingEnabled_checkbox").on("click", toggleHyperlinkAuditingSetting);
  $("#hyperlinkAuditingEnabled_checkbox").prop("checked", OPTIONS_DATA.isHyperlinkAuditingEnabled);

  // only show the alternateErrorPagesEnabled checkbox if browser supports it
  if (!OPTIONS_DATA.alternateErrorPagesAvailable) {
    $("#alternateErrorPagesEnabled").hide();
  } else {
    // check the select box if it is already disabled in the browser
    chrome.privacy.services.alternateErrorPagesEnabled.get({}, result => {
      if (result.value == false) {
        $('#alternateErrorPagesEnabled_checkbox').prop("checked", true);
      }
    });
  }

  // only show the hyperlinkAuditingEnabled checkbox if browser supports it
  if (!OPTIONS_DATA.hyperlinkAuditingAvailable) {
    $("#hyperlinkAuditingEnabled").hide();
  } else {
    // check the select box if it is already disabled in the browser
    chrome.privacy.websites.hyperlinkAuditingEnabled.get({}, result => {
      if (result.value == false) {
        $('#hyperlinkAuditingEnabled_checkbox').prop("checked", true);
      }
    });
  }

  if (OPTIONS_DATA.webRTCAvailable) {
    $("#toggle_webrtc_mode").on("click", toggleWebRTCIPProtection);

    chrome.privacy.network.webRTCIPHandlingPolicy.get({}, result => {
      // only enable the checkbox if pb can control webrtc ip leak protection
      if (result.levelOfControl.endsWith("_by_this_extension")) {
        $("#toggle_webrtc_mode").attr("disabled", false);
      }

      // auto check the option box if ip leak is already protected at diff levels, via pb or another extension
      if (result.value == "default_public_interface_only" || result.value == "disable_non_proxied_udp") {
        $("#toggle_webrtc_mode").prop("checked", true);
      }
    });

  } else {
    // Hide WebRTC-related settings for non-supporting browsers
    $("#webRTCToggle").hide();
    $("#webrtc-warning").hide();
  }

  $("#learn-in-incognito-checkbox")
    .on("click", updateLearnInIncognito)
    .prop("checked", OPTIONS_DATA.isLearnInIncognitoEnabled);

  $('#show-nontracking-domains-checkbox')
    .on("click", (event) => {
      let showNonTrackingDomains = $(event.currentTarget).prop("checked");
      chrome.runtime.sendMessage({
        type: "updateSettings",
        data: { showNonTrackingDomains }
      });
    })
    .prop("checked", OPTIONS_DATA.showNonTrackingDomains);

  const widgetSelector = $("#hide-widgets-select");
  widgetSelector.prop("disabled",
    OPTIONS_DATA.isWidgetReplacementEnabled ? false : "disabled");

  $("#replace-widgets-checkbox").change(function () {
    if ($(this).is(":checked")) {
      widgetSelector.prop("disabled", false);
    } else {
      widgetSelector.prop("disabled", "disabled");
    }
  });

  // Initialize Select2 and populate options
  widgetSelector.select2();
  OPTIONS_DATA.widgets.forEach(function (key) {
    const isSelected = OPTIONS_DATA.widgetReplacementExceptions.includes(key);
    const option = new Option(key, key, false, isSelected);
    widgetSelector.append(option).trigger("change");
  });

  widgetSelector.on('select2:select', updateWidgetReplacementExceptions);
  widgetSelector.on('select2:unselect', updateWidgetReplacementExceptions);
  widgetSelector.on('select2:clear', updateWidgetReplacementExceptions);

  reloadDisabledSites();
  reloadTrackingDomainsTab();

  $('html').css('visibility', 'visible');

  window.OPTIONS_INITIALIZED = true;
}

/**
 * Opens the file chooser to allow a user to select
 * a file to import.
 */
function loadFileChooser() {
  var fileChooser = document.getElementById('importTrackers');
  fileChooser.click();
}

/**
 * Import a list of trackers supplied by the user
 * NOTE: list must be in JSON format to be parsable
 */
function importTrackerList() {
  var file = this.files[0];

  if (file) {
    var reader = new FileReader();
    reader.readAsText(file);
    reader.onload = function(e) {
      parseUserDataFile(e.target.result);
    };
  } else {
    var selectFile = i18n.getMessage("import_select_file");
    confirm(selectFile);
  }

  document.getElementById("importTrackers").value = '';
}

/**
 * Parses Privacy Badger data uploaded by the user.
 *
 * @param {String} storageMapsList data from JSON file that user provided
 */
function parseUserDataFile(storageMapsList) {
  let lists;

  try {
    lists = JSON.parse(storageMapsList);
  } catch (e) {
    return confirm(i18n.getMessage("invalid_json"));
  }

  // validate by checking we have the same keys in the import as in the export
  if (!_.isEqual(
    Object.keys(lists).sort(),
    USER_DATA_EXPORT_KEYS.sort()
  )) {
    return confirm(i18n.getMessage("invalid_json"));
  }

  // check for webrtc setting in the imported settings map
  if (lists.settings_map.preventWebRTCIPLeak) {
    // verify that the user hasn't already enabled this option
    if (!$("#toggle_webrtc_mode").prop("checked")) {
      toggleWebRTCIPProtection();
    }
    // this browser-controlled setting doesn't belong in Badger's settings object
    delete lists.settings_map.preventWebRTCIPLeak;
  }

  chrome.runtime.sendMessage({
    type: "mergeUserData",
    data: lists
  }, (response) => {
    OPTIONS_DATA.disabledSites = response.disabledSites;
    OPTIONS_DATA.origins = response.origins;

    reloadDisabledSites();
    reloadTrackingDomainsTab();
    // TODO general settings are not updated

    confirm(i18n.getMessage("import_successful"));
  });
}

function resetData() {
  var resetWarn = i18n.getMessage("reset_data_confirm");
  if (confirm(resetWarn)) {
    chrome.runtime.sendMessage({type: "resetData"}, () => {
      // reload page to refresh tracker list
      location.reload();
    });
  }
}

function removeAllData() {
  var removeWarn = i18n.getMessage("remove_all_data_confirm");
  if (confirm(removeWarn)) {
    chrome.runtime.sendMessage({type: "removeAllData"}, () => {
      location.reload();
    });
  }
}

function downloadCloud() {
  chrome.runtime.sendMessage({type: "downloadCloud"},
    function (response) {
      if (response.success) {
        alert(i18n.getMessage("download_cloud_success"));
        OPTIONS_DATA.disabledSites = response.disabledSites;
        reloadDisabledSites();
      } else {
        console.error("Cloud sync error:", response.message);
        if (response.message === i18n.getMessage("download_cloud_no_data")) {
          alert(response.message);
        } else {
          alert(i18n.getMessage("download_cloud_failure"));
        }
      }
    }
  );
}

function uploadCloud() {
  chrome.runtime.sendMessage({type: "uploadCloud"},
    function (status) {
      if (status.success) {
        alert(i18n.getMessage("upload_cloud_success"));
      } else {
        console.error("Cloud sync error:", status.message);
        alert(i18n.getMessage("upload_cloud_failure"));
      }
    }
  );
}

/**
 * Export the user's data, including their list of trackers from
 * action_map and snitch_map, along with their settings.
 * List will be in JSON format that can be edited and reimported
 * in another instance of Privacy Badger.
 */
function exportUserData() {
  chrome.storage.local.get(USER_DATA_EXPORT_KEYS, function (maps) {

    // exports the user's prevent webrtc leak setting if it's checked
    if ($("#toggle_webrtc_mode").prop("checked")) {
      maps.settings_map.preventWebRTCIPLeak = true;
    }

    let mapJSON = JSON.stringify(maps);

    // Append the formatted date to the exported file name
    let currDate = new Date().toLocaleString();
    let escapedDate = currDate
      // illegal filename charset regex from
      // https://github.com/parshap/node-sanitize-filename/blob/ef1e8ad58e95eb90f8a01f209edf55cd4176e9c8/index.js
      .replace(/[\/\?<>\\:\*\|"]/g, '_') /* eslint no-useless-escape:off */
      // also collapse-replace commas and spaces
      .replace(/[, ]+/g, '_');
    let filename = 'PrivacyBadger_user_data-' + escapedDate + '.json';

    // Download workaround taken from uBlock Origin
    // https://github.com/gorhill/uBlock/blob/40a85f8c04840ae5f5875c1e8b5fa17578c5bd1a/platform/chromium/vapi-common.js
    let a = document.createElement('a');
    a.setAttribute('download', filename || '');

    let blob = new Blob([mapJSON], { type: 'application/json' }); // pass a useful mime type here
    a.href = URL.createObjectURL(blob);

    function clickBlobLink() {
      a.dispatchEvent(new MouseEvent('click'));
      URL.revokeObjectURL(blob);
    }

    /**
     * Firefox workaround to insert the blob link in an iFrame
     * https://bugzilla.mozilla.org/show_bug.cgi?id=1420419#c18
     */
    function addBlobWorkAroundForFirefox() {
      // Create or use existing iframe for the blob 'a' element
      let iframe = document.getElementById('exportUserDataIframe');
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = "exportUserDataIframe";
        iframe.setAttribute("style", "visibility: hidden; height: 0; width: 0");
        document.getElementById('export').appendChild(iframe);

        iframe.contentWindow.document.open();
        iframe.contentWindow.document.write('<html><head></head><body></body></html>');
        iframe.contentWindow.document.close();
      } else {
        // Remove the old 'a' element from the iframe
        let oldElement = iframe.contentWindow.document.body.lastChild;
        iframe.contentWindow.document.body.removeChild(oldElement);
      }
      iframe.contentWindow.document.body.appendChild(a);
    }

    // TODO remove browser check and simplify code once Firefox 58 goes away
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1420419
    if (chrome.runtime.getBrowserInfo) {
      chrome.runtime.getBrowserInfo((info) => {
        if (info.name == "Firefox" || info.name == "Waterfox") {
          addBlobWorkAroundForFirefox();
        }
        clickBlobLink();
      });
    } else {
      clickBlobLink();
    }
  });
}

/**
 * Update setting for whether or not to show counter on Privacy Badger badge.
 */
function updateShowCounter() {
  const showCounter = $("#show_counter_checkbox").prop("checked");

  chrome.runtime.sendMessage({
    type: "updateSettings",
    data: { showCounter }
  }, () => {
    // Refresh display for each tab's PB badge.
    chrome.tabs.query({}, function(tabs) {
      tabs.forEach(function(tab) {
        chrome.runtime.sendMessage({
          type: "updateBadge",
          tab_id: tab.id
        });
      });
    });
  });
}

/**
 * Update setting for whether or not to replace
 * social buttons/video players/commenting widgets.
 */
function updateWidgetReplacement() {
  const socialWidgetReplacementEnabled = $("#replace-widgets-checkbox").prop("checked");

  chrome.runtime.sendMessage({
    type: "updateSettings",
    data: { socialWidgetReplacementEnabled }
  });
}

/**
 * Update DNT checkbox clicked
 */
function updateDNTCheckboxClicked() {
  const enabled = $("#enable_dnt_checkbox").prop("checked");

  chrome.runtime.sendMessage({
    type: "updateSettings",
    data: {
      sendDNTSignal: enabled
    }
  });

  $("#check_dnt_policy_checkbox").prop("checked", enabled).prop("disabled", !enabled);
  updateCheckingDNTPolicy();
}

function updateCheckingDNTPolicy() {
  const enabled = $("#check_dnt_policy_checkbox").prop("checked");

  chrome.runtime.sendMessage({
    type: "updateSettings",
    data: {
      checkForDNTPolicy: enabled
    }
  });
}

function updateLearnInIncognito() {
  const learnInIncognito = $("#learn-in-incognito-checkbox").prop("checked");

  chrome.runtime.sendMessage({
    type: "updateSettings",
    data: { learnInIncognito }
  });
}

function reloadDisabledSites() {
  let sites = OPTIONS_DATA.disabledSites,
    $select = $('#allowlist-select');

  // sort disabled sites the same way blocked sites are sorted
  sites = htmlUtils.sortDomains(sites);

  $select.empty();
  for (let i = 0; i < sites.length; i++) {
    $('<option>').text(sites[i]).appendTo($select);
  }
}

function addDisabledSite(event) {
  event.preventDefault();

  let domain = utils.getHostFromDomainInput(
    document.getElementById("new-disabled-site-input").value.replace(/\s/g, "")
  );

  if (!domain) {
    return confirm(i18n.getMessage("invalid_domain"));
  }

  chrome.runtime.sendMessage({
    type: "disablePrivacyBadgerForOrigin",
    domain
  }, (response) => {
    OPTIONS_DATA.disabledSites = response.disabledSites;
    reloadDisabledSites();
    document.getElementById("new-disabled-site-input").value = "";
  });
}

function removeDisabledSite(event) {
  event.preventDefault();

  let domains = [];
  let $selected = $("#allowlist-select option:selected");
  for (let i = 0; i < $selected.length; i++) {
    domains.push($selected[i].text);
  }

  chrome.runtime.sendMessage({
    type: "enablePrivacyBadgerForOriginList",
    domains
  }, (response) => {
    OPTIONS_DATA.disabledSites = response.disabledSites;
    reloadDisabledSites();
  });
}

// Tracking Domains slider functions

/**
 * Gets action for given origin.
 * @param {String} origin - Origin to get action for.
 */
function getOriginAction(origin) {
  return OPTIONS_DATA.origins[origin];
}

function revertDomainControl(event) {
  event.preventDefault();

  let origin = $(event.target).parent().data('origin');

  chrome.runtime.sendMessage({
    type: "revertDomainControl",
    origin
  }, (response) => {
    // update any sliders that changed as a result
    updateSliders(response.origins);
    // update cached domain data
    OPTIONS_DATA.origins = response.origins;
  });
}

/**
 * Displays list of all tracking domains along with toggle controls.
 */
function updateSummary() {
  // Check to see if any tracking domains have been found before continuing.
  let allTrackingDomains = getOriginsArray(OPTIONS_DATA.origins, null, null, null, true);

  if (!allTrackingDomains || !allTrackingDomains.length) {
    // leave out number of trackers and slider instructions message if no sliders will be displayed
    $("#options_domain_list_trackers").hide();
    $("#options_domain_list_one_tracker").hide();

    // show "no trackers" message
    $("#options_domain_list_no_trackers").show();
    $("#blockedResources").html('');
    $("#tracking-domains-div").hide();

    // activate tooltips
    $('.tooltip:not(.tooltipstered)').tooltipster(TOOLTIP_CONF);

    return;
  }

  // reloadTrackingDomainsTab can be called multiple times, needs to be reversible
  $("#options_domain_list_no_trackers").hide();
  $("#tracking-domains-div").show();

  let baseDomains = new Set(allTrackingDomains.map(d => window.getBaseDomain(d)));

  // Update messages according to tracking domain count.
  if (baseDomains.size == 1) {
    // leave out messages about multiple trackers
    $("#options_domain_list_trackers").hide();

    // show singular "tracker" message
    $("#options_domain_list_one_tracker").show();
  } else {
    $("#options_domain_list_trackers").html(i18n.getMessage(
      "options_domain_list_trackers", [
        baseDomains.size,
        "<a target='_blank' title='" + _.escape(i18n.getMessage("what_is_a_tracker")) + "' class='tooltip' href='https://privacybadger.org/#What-is-a-third-party-tracker'>"
      ]
    )).show();
  }
}

/**
 * Displays list of all tracking domains along with toggle controls.
 */
function reloadTrackingDomainsTab() {
  updateSummary();

  // Get containing HTML for domain list along with toggle legend icons.
  $("#blockedResources")[0].innerHTML = htmlUtils.getTrackerContainerHtml();

  // activate tooltips
  $('.tooltip:not(.tooltipstered)').tooltipster(TOOLTIP_CONF);

  // Display tracking domains.
  showTrackingDomains(
    getOriginsArray(
      OPTIONS_DATA.origins,
      $("#trackingDomainSearch").val(),
      $('#tracking-domains-type-filter').val(),
      $('#tracking-domains-status-filter').val(),
      $('#tracking-domains-show-not-yet-blocked').prop('checked')
    )
  );
}

/**
 * Displays filtered list of tracking domains based on user input.
 */
function filterTrackingDomains() {
  const $typeFilter = $('#tracking-domains-type-filter');
  const $statusFilter = $('#tracking-domains-status-filter');

  if ($typeFilter.val() == "dnt") {
    $statusFilter.prop("disabled", true).val("");
  } else {
    $statusFilter.prop("disabled", false);
  }

  var initialSearchText = $('#trackingDomainSearch').val().toLowerCase();

  // Wait a short period of time and see if search text has changed.
  // If so it means user is still typing so hold off on filtering.
  var timeToWait = 500;
  setTimeout(function() {
    // Check search text.
    var searchText = $('#trackingDomainSearch').val().toLowerCase();
    if (searchText !== initialSearchText) {
      return;
    }

    // Show filtered origins.
    var filteredOrigins = getOriginsArray(
      OPTIONS_DATA.origins,
      searchText,
      $typeFilter.val(),
      $statusFilter.val(),
      $('#tracking-domains-show-not-yet-blocked').prop('checked')
    );
    showTrackingDomains(filteredOrigins);
  }, timeToWait);
}

/**
 * Adds more origins to the blocked resources list on scroll.
 *
*/
function addOrigins(e) {
  let domains = e.data;
  if (!domains.length) {
    return;
  }

  let el = e.target;
  let total_height = el.scrollHeight - el.clientHeight;
  if ((total_height - el.scrollTop) >= 400) {
    return;
  }

  for (let i = 0; (i < 50) && (domains.length > 0); i++) {
    let domain = domains.shift();
    let action = getOriginAction(domain);
    if (action) {
      let show_breakage_warning = (
        action == constants.USER_BLOCK &&
        OPTIONS_DATA.cookieblocked.hasOwnProperty(domain)
      );
      $(el).append(htmlUtils.getOriginHtml(domain, action, show_breakage_warning));
    }
  }

  // activate tooltips
  $('#blockedResourcesInner .tooltip:not(.tooltipstered)').tooltipster(
    htmlUtils.DOMAIN_TOOLTIP_CONF);
}

/**
 * Displays list of tracking domains along with toggle controls.
 * @param {Array} domains Tracking domains to display.
 */
function showTrackingDomains(domains) {
  domains = htmlUtils.sortDomains(domains);

  // Create HTML for the initial list of tracking domains.
  let out = '';
  for (let i = 0; (i < 50) && (domains.length > 0); i++) {
    let domain = domains.shift();
    let action = getOriginAction(domain);
    if (action) {
      let show_breakage_warning = (
        action == constants.USER_BLOCK &&
        OPTIONS_DATA.cookieblocked.hasOwnProperty(domain)
      );
      out += htmlUtils.getOriginHtml(domain, action, show_breakage_warning);
    }
  }

  // Display tracking domains.
  $('#blockedResourcesInner').html(out);

  $('#blockedResourcesInner').off("scroll");
  $('#blockedResourcesInner').on("scroll", domains, addOrigins);

  // activate tooltips
  $('#blockedResourcesInner .tooltip:not(.tooltipstered)').tooltipster(
    htmlUtils.DOMAIN_TOOLTIP_CONF);
}

/**
 * https://tools.ietf.org/html/draft-ietf-rtcweb-ip-handling-01#page-5
 *
 * Toggle WebRTC IP address leak protection setting.
 *
 * When enabled, policy is set to Mode 3 (default_public_interface_only).
 */
function toggleWebRTCIPProtection() {
  // Return early with non-supporting browsers
  if (!OPTIONS_DATA.webRTCAvailable) {
    return;
  }

  let cpn = chrome.privacy.network;

  cpn.webRTCIPHandlingPolicy.get({}, function (result) {
    // Update new value to be opposite of current browser setting
    if (result.value == 'default_public_interface_only') {
      cpn.webRTCIPHandlingPolicy.clear({});
    } else {
      cpn.webRTCIPHandlingPolicy.set({
        value: 'default_public_interface_only'
      });
    }
  });
}

// handles toggling the alternateErrorPagesEnabled setting
function toggleAlternateErrorPagesSetting() {
  // ensure this is only attempting to be set on supportive browsers
  if (!OPTIONS_DATA.alternateErrorPagesAvailable) {
    return;
  }

  let cps = chrome.privacy.services;

  // whatever the current setting is at, reverse it
  cps.alternateErrorPagesEnabled.get({}, result => {
    cps.alternateErrorPagesEnabled.set({
      value: !result.value
    });
  });
}

// handles toggling the hyperlinkAuditingEnabled setting
function toggleHyperlinkAuditingSetting() {
  // ensure this is only attempting to be set on supportive browsers
  if (!OPTIONS_DATA.hyperlinkAuditingAvailable) {
    return;
  }

  let cpw = chrome.privacy.websites;

  //whatever the current setting is at, reverse it
  cpw.hyperlinkAuditingEnabled.get({}, result => {
    cpw.hyperlinkAuditingEnabled.set({
      value: !result.value
    });
  });
}

/**
 * Updates domain tooltip, slider color.
 * Also toggles status indicators like breakage warnings.
 */
function updateOrigin(origin, action, userset) {
  let $clicker = $('#blockedResourcesInner div.clicker[data-origin="' + origin + '"]'),
    $switchContainer = $clicker.find('.switch-container').first();

  // update slider color via CSS
  $switchContainer.removeClass([
    constants.BLOCK,
    constants.COOKIEBLOCK,
    constants.ALLOW,
    constants.NO_TRACKING].join(" ")).addClass(action);

  let show_breakage_warning = (
    action == constants.BLOCK &&
    OPTIONS_DATA.cookieblocked.hasOwnProperty(origin)
  );

  htmlUtils.toggleBlockedStatus($clicker, userset, show_breakage_warning);

  // reinitialize the domain tooltip
  $clicker.find('.origin-inner').tooltipster('destroy');
  $clicker.find('.origin-inner').attr(
    'title', htmlUtils.getActionDescription(action, origin));
  $clicker.find('.origin-inner').tooltipster(htmlUtils.DOMAIN_TOOLTIP_CONF);
}

/**
 * Updates the list of tracking domains in response to user actions.
 *
 * For example, moving the slider for example.com should move the sliders
 * for www.example.com and cdn.example.com
 */
function updateSliders(updatedOriginData) {
  let updated_domains = Object.keys(updatedOriginData);

  // update any sliders that changed
  for (let domain of updated_domains) {
    let action = updatedOriginData[domain];
    if (action == OPTIONS_DATA.origins[domain]) {
      continue;
    }

    let userset = false;
    if (action.startsWith('user')) {
      userset = true;
      action = action.slice(5);
    }

    // update slider position
    let $radios = $('#blockedResourcesInner div.clicker[data-origin="' + domain + '"] input'),
      selected_val = (action == constants.DNT ? constants.ALLOW : action);
    // update the radio group without triggering a change event
    // https://stackoverflow.com/a/22635728
    $radios.val([selected_val]);

    // update domain slider row tooltip/status indicators
    updateOrigin(domain, action, userset);
  }

  // remove sliders that are no longer present
  let removed = Object.keys(OPTIONS_DATA.origins).filter(
    x => !updated_domains.includes(x));
  for (let domain of removed) {
    let $clicker = $('#blockedResourcesInner div.clicker[data-origin="' + domain + '"]');
    $clicker.remove();
  }
}

/**
 * Save the user setting for a domain by messaging the background page.
 */
function saveToggle(origin, action) {
  chrome.runtime.sendMessage({
    type: "saveOptionsToggle",
    origin,
    action
  }, (response) => {
    // first update the cache for the slider
    // that was just changed by the user
    // to avoid redundantly updating it below
    OPTIONS_DATA.origins[origin] = response.origins[origin];
    // update any sliders that changed as a result
    updateSliders(response.origins);
    // update cached domain data
    OPTIONS_DATA.origins = response.origins;
  });
}

/**
 * Remove origin from Privacy Badger.
 * @param {Event} event Click event triggered by user.
 */
function removeOrigin(event) {
  event.preventDefault();

  // confirm removal before proceeding
  if (!confirm(i18n.getMessage("options_remove_origin_confirm"))) {
    return;
  }

  let origin = $(event.target).parent().data('origin');

  chrome.runtime.sendMessage({
    type: "removeOrigin",
    origin
  }, (response) => {
    // remove rows that are no longer here
    updateSliders(response.origins);
    // update cached domain data
    OPTIONS_DATA.origins = response.origins;
    // if we removed domains, the summary text may have changed
    updateSummary();
  });
}

/**
 * Update which widgets should be blocked instead of replaced
 * @param {Event} event The DOM event triggered by selecting an option
 */
function updateWidgetReplacementExceptions() {
  const widgetReplacementExceptions = $('#hide-widgets-select').select2('data').map(({ id }) => id);
  chrome.runtime.sendMessage({
    type: "updateSettings",
    data: { widgetReplacementExceptions }
  });
}

$(function () {
  $.tooltipster.setDefaults(htmlUtils.TOOLTIPSTER_DEFAULTS);

  chrome.runtime.sendMessage({
    type: "getOptionsData",
  }, (response) => {
    OPTIONS_DATA = response;
    loadOptions();
  });
});
