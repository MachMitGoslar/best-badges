// Debug-Builds für ein Gerät schreiben ip.txt (Metro-Adresse) ins App-Bündel.
// Die Xcode-Skript-Sandbox (ENABLE_USER_SCRIPT_SANDBOXING) erlaubt Schreibzugriffe nur
// auf deklarierte Ausgaben. Statt die Sandbox abzuschalten, geben wir genau diese
// eine Datei als Ausgabe der Bauphase „Bundle React Native code and images“ frei.
const { withXcodeProject } = require('expo/config-plugins');

const PHASE = 'Bundle React Native code and images';
const OUTPUT = '"$(CONFIGURATION_BUILD_DIR)/$(UNLOCALIZED_RESOURCES_FOLDER_PATH)/ip.txt"';

module.exports = function withMetroIpOutput(config) {
  return withXcodeProject(config, (cfg) => {
    const phases = cfg.modResults.hash.project.objects.PBXShellScriptBuildPhase ?? {};
    let found = false;
    for (const [key, phase] of Object.entries(phases)) {
      if (key.endsWith('_comment') || typeof phase !== 'object') continue;
      if (String(phase.name).replace(/"/g, '') !== PHASE) continue;
      found = true;
      phase.outputPaths = phase.outputPaths ?? [];
      if (!phase.outputPaths.includes(OUTPUT)) phase.outputPaths.push(OUTPUT);
    }
    if (!found) throw new Error(`withMetroIpOutput: Bauphase „${PHASE}“ nicht gefunden`);
    return cfg;
  });
};
