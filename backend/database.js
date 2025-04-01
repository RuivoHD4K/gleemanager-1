require("dotenv").config();
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");




if (!process.env.AWS_ACCESS_KEY_ID) {
  console.error("Error: AWS_ACESS_KEY_ID is missing from environment variables");
  process.exit(1);
}


// Ensure environment variables are loaded
if (!process.env.AWS_REGION) {
  console.error("Error: AWS_REGION is missing from environment variables");
  process.exit(1);
}

// Initialize DynamoDB client with correct region
const dynamoDBClient = new DynamoDBClient({
  region: process.env.AWS_REGION, // Ensure region is set here
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const dynamoDB = DynamoDBDocumentClient.from(dynamoDBClient);

module.exports = dynamoDB;