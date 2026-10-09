const formulations = [
  { id: '1', code: 'F1', ingredients: [{ rawMaterialCode: 'RM1', phase: 'A' }] }
];

let activeModalFormulation = formulations[0];

// simulating TechnicalNotesModal
const processSteps = [
  { id: 'step-1', phaseCode: 'Fase Minyak', ingredientCodes: ['RM1'] }
];

const updatedIngredients = activeModalFormulation.ingredients.map(ing => {
  const matchingStep = processSteps.find(s => s.ingredientCodes?.includes(ing.rawMaterialCode));
  return {
    ...ing,
    phase: matchingStep && matchingStep.phaseCode ? matchingStep.phaseCode : ing.phase
  };
});

const updated = {
  ...activeModalFormulation,
  dynamicProcessSteps: processSteps,
  ingredients: updatedIngredients
};

// simulating RndModule onSaveFormula
const exists = formulations.some((f) => f.id === updated.id || f.code === updated.code);
let updatedFormulations;
if (exists) {
  updatedFormulations = formulations.map((f) => (f.id === updated.id || f.code === updated.code ? updated : f));
} else {
  updatedFormulations = [updated, ...formulations];
}

console.log(JSON.stringify(updatedFormulations, null, 2));
