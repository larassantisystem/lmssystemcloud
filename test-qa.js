const processSteps = [
  { id: '1', phaseCode: 'Fase Baru', ingredientCodes: ['RM001'] }
];
const formulation = {
  ingredients: [
    { rawMaterialCode: 'RM001', phase: 'Fase Lama' },
    { rawMaterialCode: 'RM002', phase: 'Fase Lama' }
  ]
};

const updatedIngredients = formulation.ingredients.map(ing => {
  const matchingStep = processSteps.find(s => s.ingredientCodes?.includes(ing.rawMaterialCode));
  return {
    ...ing,
    phase: matchingStep && matchingStep.phaseCode ? matchingStep.phaseCode : ing.phase
  };
});
console.log(updatedIngredients);
