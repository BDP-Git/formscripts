/**
 * 123FormBuilder Custom Script – Formular 92823 "Auslagenerstattung"
 * ==================================================================
 * Enthält:
 *   - Summenbildung: Summe der 5 Betragsfelder → Feld 3567697 (dt. Dezimalformat, FETT)
 *   - Deutsches Dezimalformat (Komma, 2 Nachkommastellen) für alle Betragsfelder
 *   - IBAN-Validierung (DE / nicht-DE) mit Mod-97-Prüfung + IBAN-Formatierung (4er-Blöcke)
 *
 * Basis: iban-validator.js für Form 88402 (Gist BDP-Git ddad2800) –
 * bewährte Hilfsfunktionen unverändert übernommen, Form-spezifische Teile entfernt
 * (PKW-Pauschale, Verpflegungspauschale, Fahrtenzählung, Zeitberechnung).
 */

(function () {
  'use strict';

  // =================================================================
  // KONFIGURATION (Formular 92823)
  // =================================================================

  // Betragsfelder (Eingabe, ShortText, dt. Dezimalformat)
  var BETRAGSFELDER = [
    { id: '3567688', label: 'Betrag 1' },
    { id: '3567696', label: 'Betrag 2' },
    { id: '3619944', label: 'Betrag 3' },
    { id: '3619947', label: 'Betrag 4' },
    { id: '3619950', label: 'Betrag 5' }
  ];

  // Summenfeld (ShortText, wird berechnet, dt. Format, fett)
  var SUMME_FELD_ID = '3567697';
  var SUMME_FELD_LABEL = 'Summe';

  // IBAN-Felder
  var IBAN_FIELDS = [
    { id: '3619863', label: 'IBAN - Deutschland',           countryLock: 'DE' },
    { id: '3619865', label: 'IBAN - außerhalb Deutschland', countryLock: null }
  ];

  var INIT_DELAY = 2500; // ms – 123FB rendert das DOM verzögert

  // =================================================================
  // TEIL 1: DEUTSCHES DEZIMALFORMAT (Komma, 2 Nachkommastellen)
  // =================================================================

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
    if (!input) return false;
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
  // TEIL 2: SUMMENBILDUNG → 3567697 (dt. Format, FETT)
  // =================================================================

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

  /** Summenfeld fett machen (CSS überlebt 123FB-Re-Renders, inline als Fallback). */
  function applySummeBold() {
    if (!document.getElementById('summe-bold-style-92823')) {
      var style = document.createElement('style');
      style.id = 'summe-bold-style-92823';
      style.textContent =
        '[data-role=control][data-id="' + SUMME_FELD_ID + '"] input[data-role=i123-input],' +
        '[data-role=control][data-id="' + SUMME_FELD_ID + '"] .form-control-static,' +
        '[data-role=control][data-id="' + SUMME_FELD_ID + '"] .i123-formula-result' +
        ' { font-weight: 700 !important; }';
      document.head.appendChild(style);
    }
    var input = getField(SUMME_FELD_ID);
    if (input) input.style.fontWeight = 'bold';
  }

  function berechneSumme() {
    if (!isFieldVisible(SUMME_FELD_ID)) return;
    var total = 0;
    BETRAGSFELDER.forEach(function (cfg) {
      // Nur sichtbare Felder einrechnen – versteckte = 0
      if (isFieldVisible(cfg.id)) {
        total += getNumericFieldValue(cfg.id);
      }
    });
    setFieldValue(SUMME_FELD_ID, total.toFixed(2).replace('.', ','));
    applySummeBold();
  }

  function attachSummeEvents() {
    var attached = 0;
    BETRAGSFELDER.forEach(function (cfg) {
      var container = document.querySelector(
        '[data-role=control][data-id="' + cfg.id + '"]'
      );
      if (!container) return;
      if (container.__summeEventsAttached) { attached++; return; }
      container.__summeEventsAttached = true;
      attached++;

      var input = container.querySelector('input[data-role=i123-input]');
      if (input) {
        input.addEventListener('input',  function () { setTimeout(berechneSumme, 50); });
        input.addEventListener('change', function () { setTimeout(berechneSumme, 50); });
        input.addEventListener('blur',   function () { setTimeout(berechneSumme, 50); });
      }

      // MutationObserver als Backup (Engine setzt Werte ohne DOM-Events)
      if (window.MutationObserver) {
        var observer = new MutationObserver(function () { setTimeout(berechneSumme, 50); });
        observer.observe(container, {
          attributes: true, childList: true, subtree: true,
          attributeFilter: ['value']
        });
      }
    });
    return attached === BETRAGSFELDER.length;
  }

  function initSumme() {
    berechneSumme();

    // Events + MutationObserver mit Retry (123FB rendert DOM oft verzögert)
    var attempts = 0;
    var maxAttempts = 10;
    function tryAttach() {
      if (attachSummeEvents()) {
        console.log('[Summe] Betrags-Summenbildung initialisiert (' + BETRAGSFELDER.length +
                    ' Felder → ' + SUMME_FELD_ID + ').');
      } else {
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(tryAttach, 500);
        } else {
          console.warn('[Summe] Nicht alle Betragsfelder gefunden nach ' + maxAttempts + ' Versuchen.');
        }
      }
    }
    tryAttach();

    // Polling alle 2s – erfasst Engine-seitige Änderungen ohne Events
    setInterval(berechneSumme, 2000);
  }

  // =================================================================
  // TEIL 3: IBAN-VALIDIERUNG (bewährt aus Form 88402)
  // =================================================================
  var INIT_DELAY_IBAN = INIT_DELAY;

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
    if (input.__ibanAttached) return;
    input.__ibanAttached = true;

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
        // Gültig → formatiert zurück schreiben (4er-Blöcke)
        var formatted = formatIBAN(input.value);
        if (formatted !== input.value) input.value = formatted;
        errorEl.style.display = 'none';
        successEl.style.display = 'block';
        input.style.borderColor = '#27ae60';
        fieldStatus[fieldConfig.id] = true;
      }
      updateSubmitButton();
    }

    input.addEventListener('blur', runValidation);
    input.addEventListener('change', runValidation);
    var debounceTimer;
    input.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(runValidation, 500);
    });
  }

  // =================================================================
  // INIT
  // =================================================================
  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
      // IBAN-Validierung mit Retry (Felder ggf. verzögert gerendert)
      var ibanAttempts = 0;
      function tryAttachIban() {
        var missing = 0;
        IBAN_FIELDS.forEach(function (cfg) {
          if (!getIbanField(cfg.id)) missing++;
          else attachIbanValidation(cfg);
        });
        if (missing > 0 && ibanAttempts < 10) {
          ibanAttempts++;
          setTimeout(tryAttachIban, 500);
        }
      }
      tryAttachIban();

      // Summenbildung
      initSumme();

      // Deutsches Format für alle Betragsfelder einrichten
      BETRAGSFELDER.forEach(setupGermanInputField);
      BETRAGSFELDER.forEach(function (cfg) {
        applyGermanFormatOnField(cfg.id);
      });

      // Summenfeld initial fett
      applySummeBold();

      console.log('[Script 92823] Initialisiert: ' + BETRAGSFELDER.length +
                  ' Betragsfelder (dt. Format), Summe → ' + SUMME_FELD_ID +
                  ' (fett), ' + IBAN_FIELDS.length + ' IBAN-Felder.');
    }, INIT_DELAY_IBAN);

    // Regelmäßige Formatierung (alle 3s) – erfasst dynamische Änderungen/Re-Renders
    setInterval(function () {
      BETRAGSFELDER.forEach(function (cfg) {
        setupGermanInputField(cfg);   // nachträglich gerenderte Felder
        applyGermanFormatOnField(cfg.id);
      });
      applySummeBold();
    }, 3000);
  });

})();
