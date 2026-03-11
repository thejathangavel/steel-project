const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const RfiExtraction = require('../models/RfiExtraction');

const SCRIPT_PATH = path.join(__dirname, '../scripts/extract_rfi.py');
const PYTHON_BIN = process.env.PYTHON_BIN || 'python';

/**
 * runRfiExtraction
 * Spawns the python script and saves parsed RFI data to DB
 * @param {string} extractionId 
 * @returns {Promise<void>}
 */
exports.runRfiExtraction = async (extractionId) => {
    try {
        const doc = await RfiExtraction.findById(extractionId);
        if (!doc) {
            console.error('[RfiService] Extraction document not found.');
            return;
        }

        doc.status = 'processing';
        await doc.save();

        const pdfPath = path.join(__dirname, '../../', doc.fileUrl);
        const pdfFilename = path.basename(pdfPath);

        console.log(`[RfiService] Starting Python RFI extraction for ${path.basename(pdfPath)}`);


        const output = await new Promise((resolve, reject) => {
            const process = spawn(PYTHON_BIN, [SCRIPT_PATH, pdfPath, doc.originalFileName]);
            let dataOut = '';
            let dataErr = '';

            process.stdout.on('data', (d) => dataOut += d.toString());
            process.stderr.on('data', (d) => dataErr += d.toString());

            process.on('close', (code) => {
                if (code !== 0) {
                    console.error('[RfiService] Python stderr:', dataErr);
                    reject(new Error(`Python exit code ${code}`));
                } else {
                    resolve(dataOut);
                }
            });
        });

        // The python script should print a JSON dictionary to stdout
        const match = output.match(/\{[\s\S]*\}/);
        if (!match) throw new Error("No JSON found in python output");

        const result = JSON.parse(match[0]);
        if (!result.success) throw new Error(result.error);

        doc.rfis = result.rfis;
        doc.status = 'completed';
        await doc.save();

        console.log(`[RfiService] Done extracting RFI for ${pdfFilename}. Extracted ${doc.rfis.length} items.`);

    } catch (err) {
        console.error('[RfiService] Failed extraction:', err);
        await RfiExtraction.findByIdAndUpdate(extractionId, {
            status: 'failed',
            errorDetails: err.message
        });
    }
};
