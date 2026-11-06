/**
 * 123FormBuilder Custom Script – IBAN-Validierung + PKW-Pauschale + Fahrtenzählung
 * ==================================================================================
 * Enthält:
 *   - IBAN-Validierung (DE / nicht-DE) mit Mod-97-Prüfung + IBAN-Formatierung (4er-Blöcke)
 *   - Deutsches Dezimalformat (Komma, 2 Nachkommastellen) für alle Preis-/Betragsfelder
 *   - PKW-Pauschale (Fahrt allein):        km × 0,30 € → ShortText 3552657
 *   - PKW-Pauschale (Fahrt mit Person):    km × 0,32 € → ShortText 3567523
 *   - Verpflegungspauschale (Mitglieder):  3515674 × 15 → ShortText 3567707
 *   - Verpflegungspauschale (Angestellte): 14×3454721+28×3454722+14×… → ShortText 3567715
 *   - Erstattungsbetrag: Summe aller Kosten → ShortText 3567669
 *   - Automatische Zählung der Fahrten ≥ 4h für Verpflegungspauschale
 *   - Zeit-zu-Dauer Berechnung für Hin- und Rückreise (DAL-basiert, inkl. Tageswechsel)
 */

(function () {
  'use strict';

  // =================================================================
  // TEIL 1: DEUTSCHES DEZIMALFORMAT (Komma, 2 Nachkommastellen) für Preis-/Betragsfelder
  // =================================================================
  // Alle Felder, die Beträge enthalten (Eingabe + Anzeige)
  var GERMAN_PRICE_FIELDS = [
    { id: '3422633', label: 'Kilometerpauschale (alternativ)' },
    { id: '3552657', label: 'PKW-Pauschale (Fahrt allein)' },
    { id: '3567523', label: 'PKW-Pauschale (Fahrt mit weiterer Person)' },
    { id: '3454714', label: 'Wege-/Verpflegungspauschale' },
    { id: '3422635', label: 'Übernachtungskosten (laut Belegen)' },
    { id: '3454715', label: 'Nebenkosten (Parkplatz, Telefongebühren; laut Belegen)' },
    { id: '3567707', label: 'Verpflegungspauschale (Mitglieder) [ShortText]' },
    { id: '3567715', label: 'Verpflegungspauschale (Angestellte) [ShortText]' },
    { id: '3567669', label: 'Erstattungsbetrag (Rechnungsbetrag) [ShortText]' }
  ];

  function getField(fieldId) {
    return document.querySelector(
      '[data-role=control][data-id="' + fieldId + '"] input[data-role=i123-input]'
    );
  }

  /**
   * Prüft, ob ein Feld im DOM sichtbar ist (nicht durch conditional logic ausgeblendet).
   * 123FB blendet conditional sections mit display:none aus → offsetParent ist dann null.
   */
  function isFieldVisible(fieldId) {
    var container = document.querySelector(
      '[data-role=control][data-id="' + fieldId + '"]'
    );
    if (!container) return false;
    // offsetParent = null wenn das Element oder ein Ancestor display:none hat
    return container.offsetParent !== null;
  }

  /**
   * Formatiert einen Wert ins deutsche Zahlenformat: Komma + 2 Nachkommastellen.
   * Beispiele: 12.5  → "12,50" , 3 → "3,00" , "12,1" → "12,10" , "" → ""
   */
  function formatGermanDecimal(value) {
    if (value === null || value === undefined || String(value).trim() === '') return '';
    var num = parseFloat(String(value).replace(',', '.'));
    if (isNaN(num)) return String(value);
    return num.toFixed(2).replace('.', ',');
  }

  /**
   * Formatiert ein Feld via DAL: Parst den aktuellen Wert und schreibt
   * das deutsche Format zurück. Speichert intern mit Punkt (für Engine).
   */
  function applyGermanFormatOnField(fieldId) {
    // Versteckte Felder nicht formatieren (würde alte DAL-Werte überschreiben)
    if (!isFieldVisible(fieldId)) return;
    try {
      if (window.loader && window.loader.getDOMAbstractionLayer) {
        var raw = window.loader.getDOMAbstractionLayer().getControlValueById(String(fieldId));
        if (raw === null || raw === undefined || raw === '') return;
        var formatted = formatGermanDecimal(raw);
        // Nur schreiben wenn sich was geändert hat
        if (formatted !== String(raw).trim()) {
          window.loader.getDOMAbstractionLayer().setControlValueById(String(fieldId), formatted);
        }
      }
    } catch (e) { /* Stille, da optional */ }
  }

  /**
   * Bereitet ein Eingabefeld für deutsche Zahlenformatierung vor:
   * - input: lässt Komma zu (keine Umwandlung mehr)
   * - blur: formatiert auf deutsches Format (Komma + 2 Dezimalstellen)
   * - DAL bekommt ebenfalls das formatierte deutsche Format
   */
  function setupGermanInputField(cfg) {
    var input = getField(cfg.id);
    if (!input) {
      console.warn('[Format] Feld "' + cfg.label + '" (ID ' + cfg.id + ') – kein input gefunden (ggf. Calculate-Feld).');
      return false;
    }
    if (input.dataset.germanFormatFixed) return true;
    input.dataset.germanFormatFixed = 'true';

    function formatOnBlur() {
      var formatted = formatGermanDecimal(input.value);
      if (formatted !== input.value) {
        input.value = formatted;
        // Auch via DAL setzen (Engine-Kompatibilität)
        try {
          if (window.loader && window.loader.getDOMAbstractionLayer) {
            window.loader.getDOMAbstractionLayer().setControlValueById(String(cfg.id), formatted);
          }
        } catch (e) {}
      }
    }

    input.addEventListener('blur', formatOnBlur);
    return true;
  }

  // =================================================================
  // TEIL 2: IBAN-VALIDIERUNG (bestehend)
  // =================================================================
  var IBAN_FIELDS = [
    { id: '3422616', label: 'IBAN - Deutschland',           countryLock: 'DE' },
    { id: '3454692', label: 'IBAN - außerhalb Deutschland', countryLock: null  }
  ];
  var INIT_DELAY = 2500;

  var IBAN_LENGTHS = {
    DE: 22, AT: 20, CH: 21, FR: 27, IT: 27, ES: 24,
    NL: 18, BE: 16, LU: 20, PL: 28, GB: 22, IE: 22,
    PT: 25, GR: 27, CZ: 24, DK: 18, SE: 24, NO: 15,
    FI: 18, HU: 28, HR: 21, SK: 24, SI: 19, LT: 20,
    LV: 21, EE: 20, BG: 22, RO: 24, MT: 31, CY: 28, LI: 21
  };

  function mod97(digitStr) {
    var remainder = 0;
    for (var i = 0; i < digitStr.length; i++) {
      remainder = (remainder * 10 + parseInt(digitStr[i], 10)) % 97;
    }
    return remainder;
  }

  function formatIBAN(iban) {
    // Entfernt alle Nicht-Zeichen, dann in 4er-Blöcke mit Leerzeichen
    var cleaned = iban.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    var parts = [];
    for (var i = 0; i < cleaned.length; i += 4) {
      parts.push(cleaned.substring(i, i + 4));
    }
    return parts.join(' ');
  }

  function validateIBAN(iban, countryLock) {
    if (!iban || iban.trim() === '') return { valid: true, error: null };
    var cleaned = iban.replace(/[\s\-]/g, '').toUpperCase();
    if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(cleaned)) {
      return { valid: false, error: 'Ungültiges IBAN-Format. Erwartet: Ländercode + Prüfziffer + Kontonummer.' };
    }
    var country = cleaned.substring(0, 2);
    if (countryLock && country !== countryLock) {
      return { valid: false, error: 'Dieses Feld ist nur für ' + countryLock + '-IBANs vorgesehen.' };
    }
    if (countryLock === null && country === 'DE') {
      return { valid: false, error: 'Für deutsche IBANs bitte das Feld "IBAN - Deutschland" verwenden.' };
    }
    if (IBAN_LENGTHS[country] && cleaned.length !== IBAN_LENGTHS[country]) {
      return { valid: false, error: 'Falsche Länge für ' + country + ': erwartet ' +
               IBAN_LENGTHS[country] + ' Zeichen, eingegeben ' + cleaned.length + '.' };
    }
    if (country === 'DE' && !/^DE[0-9]{20}$/.test(cleaned)) {
      return { valid: false, error: 'Deutsche IBAN: DE + 20 Ziffern erwartet.' };
    }
    var rearranged = cleaned.substring(4) + cleaned.substring(0, 4);
    var digits = '';
    for (var i = 0; i < rearranged.length; i++) {
      var ch = rearranged[i];
      digits += /[A-Z]/.test(ch) ? (ch.charCodeAt(0) - 55).toString() : ch;
    }
    if (mod97(digits) !== 1) {
      return { valid: false, error: 'Prüfziffer ungültig – bitte IBAN überprüfen.' };
    }
    return { valid: true, error: null };
  }

  function getIbanField(fieldId) {
    return document.querySelector(
      '[data-role=control][data-id="' + fieldId + '"] input[data-role=i123-input]'
    );
  }

  function getSubmitButton() {
    return document.querySelector('button[data-role=submit]')
        || document.querySelector('input[type=submit]')
        || document.querySelector('[data-role=submit]');
  }

  function createErrorElement(inputEl) {
    var el = document.createElement('div');
    el.className = 'iban-validation-error';
    el.style.cssText = 'color:#c0392b;font-size:12px;margin-top:4px;display:none;font-weight:500;';
    inputEl.parentNode.appendChild(el);
    return el;
  }

  function createSuccessIndicator(inputEl) {
    var el = document.createElement('div');
    el.className = 'iban-validation-ok';
    el.style.cssText = 'color:#27ae60;font-size:12px;margin-top:4px;display:none;';
    el.textContent = '✓ IBAN gültig';
    inputEl.parentNode.appendChild(el);
    return el;
  }

  var fieldStatus = {};

  function updateSubmitButton() {
    var btn = getSubmitButton();
    if (!btn) return;
    var allValid = true;
    for (var key in fieldStatus) {
      if (fieldStatus[key] === false) { allValid = false; break; }
    }
    if (!allValid) {
      btn.disabled = true;
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
    } else {
      btn.disabled = false;
      btn.style.opacity = '';
      btn.style.cursor = '';
    }
  }

  function attachIbanValidation(fieldConfig) {
    var input = getIbanField(fieldConfig.id);
    if (!input) {
      console.warn('[IBAN] Feld "' + fieldConfig.label + '" (ID ' + fieldConfig.id + ') nicht gefunden.');
      return;
    }
    var errorEl = createErrorElement(input);
    var successEl = createSuccessIndicator(input);
    fieldStatus[fieldConfig.id] = true;

    function runValidation() {
      var result = validateIBAN(input.value, fieldConfig.countryLock);
      if (!input.value || input.value.trim() === '') {
        errorEl.style.display = 'none';
        successEl.style.display = 'none';
        input.style.borderColor = '';
        fieldStatus[fieldConfig.id] = true;
      } else if (!result.valid) {
        errorEl.textContent = '⚠ ' + result.error;
        errorEl.style.display = 'block';
        successEl.style.display = 'none';
        input.style.borderColor = '#c0392b';
        fieldStatus[fieldConfig.id] = false;
      } else {
        errorEl.style.display = 'none';
        successEl.style.display = 'block';
        input.style.borderColor = '#27ae60';
        fieldStatus[fieldConfig.id] = true;
      }
      updateSubmitButton();
    }
    input.addEventListener('blur', function () {
      runValidation();
      // Nach erfolgreicher Validierung: IBAN formatieren (nur wenn Wert vorhanden)
      if (input.value && input.value.trim() !== '') {
        var formatted = formatIBAN(input.value);
        if (formatted !== input.value) {
          input.value = formatted;
          // Auch via DAL setzen, damit der formatierte Wert gespeichert wird
          try {
            if (window.loader && window.loader.getDOMAbstractionLayer) {
              window.loader.getDOMAbstractionLayer().setControlValueById(String(fieldConfig.id), formatted);
            }
          } catch (e) {}
        }
      }
    });
    var debounceTimer;
    input.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(runValidation, 500);
    });
  }

  // =================================================================
  // TEIL 3: FAHRTENZÄHLUNG (≥ 4h → Zähler für Verpflegungspauschale)
  // =================================================================

  var COUNT_CONFIG = {
    hinDurationId: '3548510',
    rueckDurationId: '3548512',
    checkboxId: '3515661',
    targetCountId: '3515674',
    targetSimpleId: '3515717'
  };

  // =================================================================
  // TEIL 3a: ZEIT-zu-DAUER Berechnung (ersetzt Calculate-Felder)
  // =================================================================

  var TIME_CONFIG = {
    startHinId:  '3422622',
    endHinId:    '3515393',
    durationHinId:  '3548510',
    startRueckId: '3515450',
    endRueckId:  '3422625',
    durationRueckId: '3548512'
  };

  function parseTimeString(str) {
    // Accepts "HH:MM" and "HH:MM:SS" (123FB includes seconds!)
    if (!str || typeof str !== "string") return null;
    var parts = str.trim().split(":");
    if (parts.length < 2) return null;
    var h = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return null;
    if (h < 0 || h > 23 || m < 0 || m > 59) return null;
    return h + m / 60;
  }

  function getTimeFieldValue(fieldId) {
    // 1. DOMAbstractionLayer (reads reliably, even invisible inputs)
    try {
      if (window.loader && typeof window.loader.getDOMAbstractionLayer === "function") {
        var raw = window.loader.getDOMAbstractionLayer().getControlValueById(String(fieldId));
        if (raw !== null && raw !== undefined && raw !== "") {
          var result = parseTimeString(String(raw));
          if (result !== null) return result;
        }
      }
    } catch (e) { /* fallback */ }

    // 2. DOM fallback (try all inputs in the container)
    var container = document.querySelector(
      "[data-role=control][data-id=\"" + fieldId + "\"]"
    );
    if (container) {
      var inputs = container.querySelectorAll("input");
      for (var i = 0; i < inputs.length; i++) {
        var val = inputs[i].value;
        if (val && val.indexOf(":") !== -1) {
          var result = parseTimeString(val);
          if (result !== null) return result;
        }
      }
    }
    return null;
  }

  function calculateAndSetDuration(startTimeId, endTimeId, durationFieldId) {
    var start = getTimeFieldValue(startTimeId);
    var end = getTimeFieldValue(endTimeId);

    if (start === null || end === null) {
      setFieldValue(durationFieldId, '');
      return;
    }

    var duration = end - start;
    if (duration < 0) duration += 24; // Tageswechsel (z. B. 22:00 → 02:00)
    duration = Math.round(duration * 100) / 100; // 2 Nachkommastellen

    setFieldValue(durationFieldId, String(duration).replace('.', ','));
  }

  function onTimeChange() {
    calculateAndSetDuration(TIME_CONFIG.startHinId, TIME_CONFIG.endHinId, TIME_CONFIG.durationHinId);
    calculateAndSetDuration(TIME_CONFIG.startRueckId, TIME_CONFIG.endRueckId, TIME_CONFIG.durationRueckId);
    updateQualifyingCount();
  }

  function initTimeCalculation() {
    var timeIds = [
      TIME_CONFIG.startHinId, TIME_CONFIG.endHinId,
      TIME_CONFIG.startRueckId, TIME_CONFIG.endRueckId
    ];

    // 1. Events + MutationObserver auf jedem Container
    timeIds.forEach(function(id) {
      var container = document.querySelector(
        '[data-role=control][data-id="' + id + '"]'
      );
      if (!container) {
        console.warn('[TimeCalc] Container ID ' + id + ' nicht im DOM.');
        return;
      }

      // container selbst: change + input (falls 123FB diese feuert)
      container.addEventListener('change', function() {
        setTimeout(onTimeChange, 50);
      });
      container.addEventListener('input', function() {
        setTimeout(onTimeChange, 50);
      });

      // Alle Inputs im Container direkt überwachen
      var inputs = container.querySelectorAll('input');
      for (var i = 0; i < inputs.length; i++) {
        inputs[i].addEventListener('change', function() {
          setTimeout(onTimeChange, 50);
        });
        inputs[i].addEventListener('input', function() {
          setTimeout(onTimeChange, 50);
        });
      }

      // MutationObserver auf dem Container (erkennt DOM-Änderungen)
      if (window.MutationObserver) {
        var observer = new MutationObserver(function() {
          setTimeout(onTimeChange, 50);
        });
        observer.observe(container, {
          attributes: true,
          childList: true,
          subtree: true,
          attributeFilter: ['value', 'data-value', 'aria-checked', 'class', 'style']
        });
      }
    });

    // 2. Polling als Safety-Net (setInterval alle 2s)
    //    123FB setzt hidden-input.value programmatisch ohne DOM-Event → nur Polling hilft
    var lastValues = {};
    setInterval(function() {
      var changed = false;
      timeIds.forEach(function(id) {
        try {
          var raw = window.loader.getDOMAbstractionLayer().getControlValueById(String(id));
          if (raw !== lastValues[id]) {
            lastValues[id] = raw;
            changed = true;
          }
        } catch (e) {}
      });
      if (changed) {
        onTimeChange();
      }
    }, 2000);

    // 3. Initial-Berechnung
    onTimeChange();

    // 4. Initialwerte für Polling merken
    timeIds.forEach(function(id) {
      try {
        lastValues[id] = window.loader.getDOMAbstractionLayer().getControlValueById(String(id));
      } catch (e) {}
    });

    console.log('[TimeCalc] Zeit-Berechnung initialisiert (Events + MutationObserver + Polling 2s).');
  }

  function getNumericFieldValue(fieldId) {
    try {
      if (window.loader && window.loader.engine) {
        var val = window.loader.engine.document.getElementById(fieldId).getProperty('value.value');
        var num = parseFloat(String(val).replace(',', '.'));
        if (!isNaN(num)) return num;
      }
    } catch (e) { /* Fallback auf DOM */ }

    var input = document.querySelector(
      '[data-role=control][data-id="' + fieldId + '"] input[data-role=i123-input]'
    );
    if (input) {
      var num = parseFloat(input.value.replace(',', '.'));
      if (!isNaN(num)) return num;
    }

    var display = document.querySelector(
      '[data-role=control][data-id="' + fieldId + '"] .form-control-static, ' +
      '[data-role=control][data-id="' + fieldId + '"] .i123-formula-result'
    );
    if (display) {
      var num = parseFloat(display.textContent.trim().replace(',', '.'));
      if (!isNaN(num)) return num;
    }
    return 0;
  }

  function getMultipleChoiceSelected(fieldId) {
    var container = document.querySelector(
      '[data-role=control][data-id="' + fieldId + '"]'
    );
    if (!container) {
      console.warn('[Count] Container für MC ' + fieldId + ' nicht gefunden.');
      return [];
    }

    var selected = [];

    // ---------------------------------------------------------------
    // STRATEGIE 1 (optimiert für 123FB Custom-Checkboxen):
    //   <input type="checkbox" data-value="Hinreise"> + :checked
    // ---------------------------------------------------------------
    var checkboxes = container.querySelectorAll(
      'input[type="checkbox"]:checked'
    );
    checkboxes.forEach(function(cb) {
      // 123FB speichert den Wert in data-value
      var val = cb.getAttribute('data-value') || cb.value;
      if (val && selected.indexOf(val) === -1) selected.push(val);
    });

    // ---------------------------------------------------------------
    // STRATEGIE 2: <label data-role="checkbox" aria-checked="true">
    //   (wird von 123FB beim Anklicken gesetzt)
    // ---------------------------------------------------------------
    if (selected.length === 0) {
      var checkedLabels = container.querySelectorAll(
        'label[data-role="checkbox"][aria-checked="true"]'
      );
      checkedLabels.forEach(function(lbl) {
        // Das zugehörige <input> hat data-value
        var forId = lbl.getAttribute('for');
        var input = forId ? container.querySelector('#' + forId.replace(/(["\\])/g, '\\$1')) : null;
        if (input) {
          var val = input.getAttribute('data-value') || input.value;
          if (val && selected.indexOf(val) === -1) selected.push(val);
        }
      });
    }

    // ---------------------------------------------------------------
    // STRATEGIE 3: Elemente mit selected/active-Klasse
    // ---------------------------------------------------------------
    if (selected.length === 0) {
      var selectedEls = container.querySelectorAll(
        '.selected, .active, ' +
        '[class*="choice-selected"], ' +
        '[class*="i123-checked"], ' +
        '[aria-pressed="true"], ' +
        '[data-selected="true"]'
      );
      selectedEls.forEach(function(el) {
        // Prüfen ob es ein Choice-Bereich ist (choice-box)
        var choiceBox = el.closest('[data-role="choice"]');
        if (choiceBox) {
          var input = choiceBox.querySelector('input[data-value]');
          if (input) {
            var val = input.getAttribute('data-value') || input.value;
            if (val && selected.indexOf(val) === -1) selected.push(val);
          }
        }
      });
    }

    // ---------------------------------------------------------------
    // STRATEGIE 4: Versteckte Inputs (falls 123FB dort Werte speichert)
    // ---------------------------------------------------------------
    if (selected.length === 0) {
      var hiddenInputs = container.querySelectorAll('input[type="hidden"]');
      hiddenInputs.forEach(function(inp) {
        var val = inp.value;
        if (val && selected.indexOf(val) === -1) selected.push(val);
      });
    }

    // ---------------------------------------------------------------
    // DEBUG: Container-Struktur nur 1x loggen, wenn leer
    // ---------------------------------------------------------------
    if (selected.length === 0 && !container.__debugLogged) {
      container.__debugLogged = true;
      console.log('[Count] === DEBUG MC ' + fieldId + ' (immer noch leer) ===');
      console.log('[Count] checked inputs:',
        container.querySelectorAll('input[type="checkbox"]:checked').length);
      console.log('[Count] aria-checked labels:',
        container.querySelectorAll('label[data-role="checkbox"][aria-checked="true"]').length);
      console.log('[Count] Mit "choice-selected":',
        container.querySelectorAll('[class*="choice-selected"]').length);
      console.log('[Count] === END DEBUG ===');
    }

    return selected;
  }

  function setFieldValue(fieldId, value) {
    // 1. DOMAbstractionLayer (löst auch value-change-Events in der Engine aus)
    try {
      if (window.loader && window.loader.getDOMAbstractionLayer) {
        window.loader.getDOMAbstractionLayer().setControlValueById(
          String(fieldId), String(value)
        );
        return;
      }
    } catch (e) { /* Fallback */ }

    // 2. Engine-API direkt
    try {
      if (window.loader && window.loader.engine) {
        window.loader.engine.document.getElementById(fieldId).setValue({ value: String(value) });
        return;
      }
    } catch (e) { /* Fallback */ }

    // 3. DOM-Fallback
    var input = document.querySelector(
      '[data-role=control][data-id="' + fieldId + '"] input[data-role=i123-input]'
    );
    if (input) {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function updateQualifyingCount() {
    var hinDuration = getNumericFieldValue(COUNT_CONFIG.hinDurationId);
    var rueckDuration = getNumericFieldValue(COUNT_CONFIG.rueckDurationId);
    var selectedOptions = getMultipleChoiceSelected(COUNT_CONFIG.checkboxId);

    var hinChecked = selectedOptions.indexOf('Hinreise') !== -1;
    var rueckChecked = selectedOptions.indexOf('Rückreise') !== -1;

    var count = 0;
    if (hinDuration >= 4 || hinChecked) count++;
    if (rueckDuration >= 4 || rueckChecked) count++;

    var simpleCount = 0;
    if (hinDuration >= 4) simpleCount++;
    if (rueckDuration >= 4) simpleCount++;

    setFieldValue(COUNT_CONFIG.targetCountId, count);
    setFieldValue(COUNT_CONFIG.targetSimpleId, simpleCount);
  }

  function attachCountEvents() {
    var mcContainer = document.querySelector(
      '[data-role=control][data-id="' + COUNT_CONFIG.checkboxId + '"]'
    );
    if (!mcContainer) return false;

    // Nur einmal attachieren (Flag am Container)
    if (mcContainer.__countEventsAttached) return true;
    mcContainer.__countEventsAttached = true;

    // CHANGE-Event auf dem Container abfangen
    mcContainer.addEventListener('change', function() {
      setTimeout(updateQualifyingCount, 50);
    });

    // CLICK-Event für Button-Choices ohne change-Event
    mcContainer.addEventListener('click', function() {
      setTimeout(updateQualifyingCount, 50);
    });

    // Alle Inputs/Buttons im Container direkt überwachen
    mcContainer.querySelectorAll(
      'input[type="checkbox"], input[type="radio"], ' +
      'button, [role="checkbox"], [role="radio"], ' +
      '[role="button"], .i123-choice'
    ).forEach(function(inp) {
      inp.addEventListener('change', function() {
        setTimeout(updateQualifyingCount, 50);
      });
      inp.addEventListener('click', function() {
        setTimeout(updateQualifyingCount, 50);
      });
    });

    // MutationObserver: reagiert auf dynamische DOM-Änderungen
    if (window.MutationObserver) {
      var observer = new MutationObserver(function() {
        updateQualifyingCount();
      });
      observer.observe(mcContainer, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ['class', 'aria-checked', 'data-selected', 'value', 'style']
      });
    }

    // ---------------------------------------------------------------
    // AUCH AUF DIE DAUER-EINGABEFELDER HÖREN (3515429, 3515451)
    // ---------------------------------------------------------------
    function attachDurationListeners(fieldId) {
      var input = document.querySelector(
        '[data-role=control][data-id="' + fieldId + '"] input[data-role=i123-input]'
      );
      if (!input) return;
      if (input.__countEventsAttached) return;
      input.__countEventsAttached = true;

      input.addEventListener('input', function() {
        setTimeout(updateQualifyingCount, 50);
      });
      input.addEventListener('change', function() {
        setTimeout(updateQualifyingCount, 50);
      });
    }

    attachDurationListeners(COUNT_CONFIG.hinDurationId);
    attachDurationListeners(COUNT_CONFIG.rueckDurationId);

    return true;
  }

  function initCountLogic() {
    updateQualifyingCount();

    // Event-Listener mehrfach versuchen (123FB rendert DOM oft verzögert)
    var attempts = 0;
    var maxAttempts = 10;
    function tryAttach() {
      if (attachCountEvents()) {
        console.log('[Count] Fahrtenzählung initialisiert.');
      } else {
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(tryAttach, 500);
        } else {
          console.warn('[Count] Container MC ' + COUNT_CONFIG.checkboxId + ' nicht gefunden nach ' +
                       maxAttempts + ' Versuchen.');
        }
      }
    }
    tryAttach();
  }

  // =================================================================
  // TEIL 4: PKW-PAUSCHALE "FAHRT ALLEIN" (0,30 €/km → ShortText 3552657)
  // =================================================================

  // -----------------------------------------------------------------
  // PKW-Pauschale Konfigurationen (0,30 €/km allein / 0,32 €/km mit Person)
  // -----------------------------------------------------------------
  var KM_ALLEIN_CONFIG = {
    kmFieldId: '3454707',
    resultFieldId: '3552657',
    label: 'PKW-Pauschale (Fahrt allein)',
    rate: 0.30
  };

  var KM_MIT_CONFIG = {
    kmFieldId: '3454707',
    resultFieldId: '3567523',
    label: 'PKW-Pauschale (Fahrt mit weiterer Person)',
    rate: 0.32
  };

  function initKmPauschale(konfig) {
    var container = document.querySelector(
      '[data-role=control][data-id="' + konfig.kmFieldId + '"]'
    );
    if (!container) {
      console.warn('[KmPauschale] Kilometer-Feld ' + konfig.kmFieldId + ' nicht gefunden.');
      return false;
    }
    // Flag pro Konfiguration (resultFieldId als Key)
    var flagKey = '__kmPauschaleAttached_' + konfig.resultFieldId;
    if (container[flagKey]) return true;
    container[flagKey] = true;

    function calculate() {
      // Ergebnis-Feld versteckt → leeren (kein Stale-Value im DAL)
      if (!isFieldVisible(konfig.resultFieldId)) {
        setFieldValue(konfig.resultFieldId, '');
        return;
      }
      var km = getNumericFieldValue(konfig.kmFieldId);
      if (!km || km <= 0) {
        setFieldValue(konfig.resultFieldId, '');
        return;
      }
      var result = km * konfig.rate;
      var formatted = result.toFixed(2).replace('.', ','); // Deutsches Format: "12,30"
      setFieldValue(konfig.resultFieldId, formatted);
    }

    // Events auf das km-Feld
    var input = container.querySelector('input[data-role=i123-input]');
    if (input) {
      input.addEventListener('input', function () { setTimeout(calculate, 50); });
      input.addEventListener('change', function () { setTimeout(calculate, 50); });
      input.addEventListener('blur', function () { setTimeout(calculate, 50); });
    }

    // MutationObserver als Backup
    if (window.MutationObserver) {
      var observer = new MutationObserver(function () { setTimeout(calculate, 50); });
      observer.observe(container, {
        attributes: true, childList: true, subtree: true,
        attributeFilter: ['value']
      });
    }

    // Polling alle 2s (wie bei der Zeitberechnung)
    setInterval(calculate, 2000);

    // Initialberechnung
    setTimeout(calculate, 100);

    console.log('[KmPauschale] PKW-Pauschale (' + konfig.rate + ' €/km) → Feld ' + konfig.resultFieldId + '.');
    return true;
  }

  // =================================================================
  // TEIL 5: BERECHNUNGEN (ShortText statt Calculate-Felder)
  // =================================================================

  var KALKULATIONEN = [
    // 3567707 = 3515674 (Anzahl Fahrten ≥ 4h) × 15
    {
      id: '3567707',
      label: 'Verpflegungspauschale (Mitglieder)',
      fn: function () {
        var count = getNumericFieldValue('3515674');
        return count * 15;
      }
    },
    // 3567715 = 14·3454721 + 28·3454722 + 14·3454723 - (5,6·3515663 + 11,2·3515666)
    {
      id: '3567715',
      label: 'Verpflegungspauschale (Angestellte)',
      fn: function () {
        return 14  * getNumericFieldValue('3454721')
             + 28  * getNumericFieldValue('3454722')
             + 14  * getNumericFieldValue('3454723')
             - ( 5.6 * getNumericFieldValue('3515663')
               + 11.2 * getNumericFieldValue('3515666'));
      }
    },
    // 3567669 = Summe aller Kosten + 20·3515458
    {
      id: '3567669',
      label: 'Erstattungsbetrag (Rechnungsbetrag)',
      fn: function () {
        var ids = ['3422633','3552657','3567523','3422635','3454715','3567707','3567715'];
        var total = 0;
        ids.forEach(function (id) {
          // Nur sichtbare Felder einrechnen – versteckte = 0 (exklusive Alternativen)
          if (isFieldVisible(id)) {
            total += getNumericFieldValue(id);
          }
        });
        total += 20 * getNumericFieldValue('3515458');
        return total;
      }
    }
  ];

  function berechneUndSetze(kalk) {
    // Ergebnis-Feld versteckt → leeren (kein Stale-Value)
    if (!isFieldVisible(kalk.id)) {
      setFieldValue(kalk.id, '');
      return;
    }
    var wert = kalk.fn();
    var formatted = wert.toFixed(2).replace('.', ',');
    setFieldValue(kalk.id, formatted);
  }

  function initBerechnungen() {
    // Initiale Berechnung (Reihenfolge = Dependency-Chain beachten)
    KALKULATIONEN.forEach(function (k) { berechneUndSetze(k); });

    // Polling alle 2s – erfasst Änderungen in abhängigen Feldern
    setInterval(function () {
      KALKULATIONEN.forEach(function (k) { berechneUndSetze(k); });
    }, 2000);

    console.log('[Berechnung] ' + KALKULATIONEN.length + ' ShortText-Berechnungen aktiviert (3567707, 3567715, 3567669).');
  }

  // =================================================================
  // INIT
  // =================================================================
  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
      IBAN_FIELDS.forEach(attachIbanValidation);
      initKmPauschale(KM_ALLEIN_CONFIG);
      initKmPauschale(KM_MIT_CONFIG);
      initCountLogic();
      initTimeCalculation();
      initBerechnungen();

      // Deutsches Format für alle Preis-Felder einrichten
      GERMAN_PRICE_FIELDS.forEach(setupGermanInputField);
      // Initiale Formatierung (auch für Calculate/Display-Felder ohne input)
      GERMAN_PRICE_FIELDS.forEach(function (cfg) {
        applyGermanFormatOnField(cfg.id);
      });

      console.log('[Script] Initialisiert: ' + GERMAN_PRICE_FIELDS.length + ' Preis-Felder (dt. Format), ' +
                  IBAN_FIELDS.length + ' IBAN-Felder, Fahrtenzählung, Zeitberechnung, ' +
                  'PKW 0,30/0,32 €/km, Verpfl. Mitgl./Angest., Erstattungsbetrag.');
    }, INIT_DELAY);

    // Regelmäßige Formatierung (alle 3s) – erfasst Calculate-Felder und dynamische Änderungen
    setInterval(function () {
      GERMAN_PRICE_FIELDS.forEach(function (cfg) {
        setupGermanInputField(cfg);   // nachträglich gerenderte Felder
        applyGermanFormatOnField(cfg.id);
      });
    }, 3000);
  });

})();
