(function(){
    window.addEventListener('load', function(){

        // === DEINE FELD-IDs ===
        var sourceControlId = 3445149;   // Quellfeld (von hier wird der Wert kopiert)
        var targetControlId = 3457315;   // Zielfeld (hierhin wird der Wert geschrieben)
        // ======================

        var sourceControlInstance = loader.getEngine().getDocument().getElementById(sourceControlId);
        var targetControlInstance = loader.getEngine().getDocument().getElementById(targetControlId);

        // Bei jeder Änderung im Quellfeld: Wert ins Zielfeld kopieren
        sourceControlInstance.on('value-change', function(){
            targetControlInstance.setValue(sourceControlInstance.getValue());
        });

        // Initialwert beim Laden setzen (falls Quellfeld schon vorausgefüllt ist)
        targetControlInstance.setValue(sourceControlInstance.getValue());
    });
})();
