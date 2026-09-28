import { Camunda8 } from '@camunda8/sdk';
import path from 'path';

const c8 = new Camunda8({
  ZEEBE_GRPC_ADDRESS: 'grpc://127.0.0.1:26500',
  ZEEBE_REST_ADDRESS: 'http://127.0.0.1:8080',
  CAMUNDA_AUTH_STRATEGY: 'NONE'
});

// Strict client (preferred once migrated)
const zeebe = c8.getZeebeGrpcApiClient();

export async function setupCamunda() {
  console.log('Deploying Camunda models...');
  try {
    await zeebe.deployResource({
      processFilename: path.join(__dirname, 'chat-action-approval.bpmn'),
    });
    await zeebe.deployResource({
      processFilename: path.join(__dirname, 'chat-action-decision.dmn'),
    });
    console.log('Successfully deployed models to Camunda 8 local cluster.');
  } catch (error) {
    console.error('Failed to deploy models to Camunda 8 (ensure c8run is started):', error);
  }

  console.log('Starting Zeebe worker for "execute-action"...');
  zeebe.createWorker({
    taskType: 'execute-action',
    taskHandler: (job) => {
      console.log(`[Zeebe Worker] handling job of type ${job.type}`);
      const { actionName, amount } = job.variables;
      console.log(`Executing action: ${actionName} for amount: $${amount}`);
      
      // In a real app, this would execute the actual backend logic (e.g. Stripe refund)
      
      return job.complete({
        serviceTaskOutcome: 'Action executed successfully!',
      });
    },
  });
}
