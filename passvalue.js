(function(){
    window.addEventListener('load', function(){

        // === FELD-PAARE DEFINIEREN ===
        var fieldPairs = [
            { source: 3445149, target: 3457315 },  // Titel 1
            { source: 3445152, target: 3457317 },  // Titel 2
            { source: 3457309, target: 3457404 },  // Titel 3
            { source: 3598264, target: 3598303 }   // Titel 4 (neu)
        ];
        // =============================

        // Für jedes Paar die Synchronisation einrichten
        fieldPairs.forEach(function(pair){
            var sourceInstance = loader.getEngine().getDocument().getElementById(pair.source);
            var targetInstance = loader.getEngine().getDocument().getElementById(pair.target);

            // Bei jeder Änderung im Quellfeld: Wert ins Zielfeld kopieren
            sourceInstance.on('value-change', function(){
                targetInstance.setValue(sourceInstance.getValue());
            });

            // Initialwert beim Laden setzen
            targetInstance.setValue(sourceInstance.getValue());
        });
    });
})();
