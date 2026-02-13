(function(){
    window.addEventListener('load', function(){

        // === FELD-PAARE DEFINIEREN ===
        var fieldPairs = [
            { source: 3445149, target: 3457315 },  // Paar 1 (bestehendes)
            { source: 3445152, target: 3457317 },  // Paar 2 (neu)
            { source: 3457309, target: 3457404 }   // Paar 3 (neu)
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
