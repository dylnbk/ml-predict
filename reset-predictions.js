#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const readline = require('readline');
const path = require('path');

/**
 * Database Reset Script for Prophet IQ ML Predict
 * 
 * This script safely deletes prediction data with user prompts and confirmations.
 * It provides options to delete past predictions, future predictions, or both,
 * along with related data cleanup options.
 */

class DatabaseResetTool {
  constructor() {
    this.dbPath = path.join(__dirname, 'crypto_data.db');
    this.db = null;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  /**
   * Initialize database connection
   */
  async connectDatabase() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('❌ Error connecting to database:', err.message);
          reject(err);
        } else {
          console.log('✅ Connected to predictions database');
          resolve();
        }
      });
    });
  }

  /**
   * Close database connection and readline interface
   */
  async cleanup() {
    if (this.db) {
      await new Promise((resolve) => {
        this.db.close((err) => {
          if (err) {
            console.error('Error closing database:', err.message);
          }
          resolve();
        });
      });
    }
    this.rl.close();
  }

  /**
   * Prompt user for input
   */
  async prompt(question) {
    return new Promise((resolve) => {
      this.rl.question(question, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  /**
   * Get count of records that would be affected by deletion
   */
  async getRecordCounts() {
    const currentTime = Date.now();
    
    return new Promise((resolve, reject) => {
      const queries = {
        totalPredictions: 'SELECT COUNT(*) as count FROM predictions',
        pastPredictions: 'SELECT COUNT(*) as count FROM predictions WHERE target_time <= ?',
        futurePredictions: 'SELECT COUNT(*) as count FROM predictions WHERE target_time > ?',
        predictionMetrics: 'SELECT COUNT(*) as count FROM prediction_metrics',
        technicalIndicators: 'SELECT COUNT(*) as count FROM technical_indicators'
      };

      const results = {};
      let completed = 0;
      const total = Object.keys(queries).length;

      Object.entries(queries).forEach(([key, query]) => {
        const params = key.includes('Predictions') && key !== 'totalPredictions' ? [currentTime] : [];
        
        this.db.get(query, params, (err, row) => {
          if (err) {
            reject(err);
            return;
          }
          
          results[key] = row.count;
          completed++;
          
          if (completed === total) {
            resolve(results);
          }
        });
      });
    });
  }

  /**
   * Display current database statistics
   */
  async showDatabaseStats() {
    try {
      const counts = await this.getRecordCounts();
      const currentTime = new Date().toLocaleString();
      
      console.log('\n📊 Current Database Statistics:');
      console.log('═'.repeat(50));
      console.log(`📅 Current Time: ${currentTime}`);
      console.log(`📈 Total Predictions: ${counts.totalPredictions.toLocaleString()}`);
      console.log(`⏮️  Past Predictions: ${counts.pastPredictions.toLocaleString()}`);
      console.log(`⏭️  Future Predictions: ${counts.futurePredictions.toLocaleString()}`);
      console.log(`📊 Prediction Metrics: ${counts.predictionMetrics.toLocaleString()}`);
      console.log(`🔧 Technical Indicators: ${counts.technicalIndicators.toLocaleString()}`);
      console.log('═'.repeat(50));
      
      return counts;
    } catch (error) {
      console.error('❌ Error getting database statistics:', error.message);
      throw error;
    }
  }

  /**
   * Show deletion options menu
   */
  showDeletionMenu() {
    console.log('\n🗑️  Deletion Options:');
    console.log('═'.repeat(40));
    console.log('1. Delete only PAST predictions (target_time <= current time)');
    console.log('2. Delete only FUTURE predictions (target_time > current time)');
    console.log('3. Delete BOTH past and future predictions');
    console.log('4. Cancel operation');
    console.log('═'.repeat(40));
  }

  /**
   * Get user's deletion choice
   */
  async getDeletionChoice() {
    while (true) {
      const choice = await this.prompt('\nEnter your choice (1-4): ');
      
      switch (choice) {
        case '1':
          return 'past';
        case '2':
          return 'future';
        case '3':
          return 'both';
        case '4':
          return 'cancel';
        default:
          console.log('❌ Invalid choice. Please enter 1, 2, 3, or 4.');
      }
    }
  }

  /**
   * Get user confirmation for deletion
   */
  async getConfirmation(message) {
    while (true) {
      const response = await this.prompt(`${message} (yes/no): `);
      const answer = response.toLowerCase();
      
      if (answer === 'yes' || answer === 'y') {
        return true;
      } else if (answer === 'no' || answer === 'n') {
        return false;
      } else {
        console.log('❌ Please enter "yes" or "no".');
      }
    }
  }

  /**
   * Delete predictions based on user choice
   */
  async deletePredictions(choice) {
    const currentTime = Date.now();
    let query;
    let params = [];
    let description;

    switch (choice) {
      case 'past':
        query = 'DELETE FROM predictions WHERE target_time <= ?';
        params = [currentTime];
        description = 'past predictions';
        break;
      case 'future':
        query = 'DELETE FROM predictions WHERE target_time > ?';
        params = [currentTime];
        description = 'future predictions';
        break;
      case 'both':
        query = 'DELETE FROM predictions';
        params = [];
        description = 'all predictions';
        break;
      default:
        throw new Error('Invalid deletion choice');
    }

    return new Promise((resolve, reject) => {
      this.db.run(query, params, function(err) {
        if (err) {
          reject(err);
        } else {
          console.log(`✅ Successfully deleted ${this.changes} ${description}`);
          resolve(this.changes);
        }
      });
    });
  }

  /**
   * Delete prediction metrics
   */
  async deletePredictionMetrics() {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM prediction_metrics', [], function(err) {
        if (err) {
          reject(err);
        } else {
          console.log(`✅ Successfully deleted ${this.changes} prediction metrics records`);
          resolve(this.changes);
        }
      });
    });
  }

  /**
   * Delete technical indicators
   */
  async deleteTechnicalIndicators() {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM technical_indicators', [], function(err) {
        if (err) {
          reject(err);
        } else {
          console.log(`✅ Successfully deleted ${this.changes} technical indicators records`);
          resolve(this.changes);
        }
      });
    });
  }

  /**
   * Execute deletion with transaction safety
   */
  async executeWithTransaction(deletionChoice, includeMetrics, includeIndicators) {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION', async (err) => {
          if (err) {
            reject(err);
            return;
          }

          try {
            const results = {
              predictions: 0,
              metrics: 0,
              indicators: 0
            };

            // Delete predictions
            results.predictions = await this.deletePredictions(deletionChoice);

            // Delete prediction metrics if requested
            if (includeMetrics) {
              results.metrics = await this.deletePredictionMetrics();
            }

            // Delete technical indicators if requested
            if (includeIndicators) {
              results.indicators = await this.deleteTechnicalIndicators();
            }

            // Commit transaction
            this.db.run('COMMIT', (err) => {
              if (err) {
                reject(err);
              } else {
                resolve(results);
              }
            });

          } catch (error) {
            // Rollback on error
            this.db.run('ROLLBACK', (rollbackErr) => {
              if (rollbackErr) {
                console.error('❌ Error during rollback:', rollbackErr.message);
              }
              reject(error);
            });
          }
        });
      });
    });
  }

  /**
   * Main execution flow
   */
  async run() {
    try {
      console.log('🚀 Prophet IQ Database Reset Tool');
      console.log('═'.repeat(50));
      
      // Connect to database
      await this.connectDatabase();
      
      // Show current statistics
      const initialCounts = await this.showDatabaseStats();
      
      // Check if there's any data to delete
      if (initialCounts.totalPredictions === 0) {
        console.log('\n✅ No predictions found in database. Nothing to delete.');
        return;
      }
      
      // Show deletion menu and get user choice
      this.showDeletionMenu();
      const deletionChoice = await this.getDeletionChoice();
      
      if (deletionChoice === 'cancel') {
        console.log('\n✅ Operation cancelled by user.');
        return;
      }
      
      // Get counts for the specific deletion choice
      const currentTime = Date.now();
      let targetCount;
      let targetDescription;
      
      switch (deletionChoice) {
        case 'past':
          targetCount = initialCounts.pastPredictions;
          targetDescription = 'past predictions';
          break;
        case 'future':
          targetCount = initialCounts.futurePredictions;
          targetDescription = 'future predictions';
          break;
        case 'both':
          targetCount = initialCounts.totalPredictions;
          targetDescription = 'all predictions';
          break;
      }
      
      if (targetCount === 0) {
        console.log(`\n✅ No ${targetDescription} found. Nothing to delete.`);
        return;
      }
      
      // Ask about related data cleanup
      console.log('\n🧹 Related Data Cleanup Options:');
      const includeMetrics = await this.getConfirmation(
        `Delete prediction metrics (${initialCounts.predictionMetrics} records)?`
      );
      
      const includeIndicators = await this.getConfirmation(
        `Delete technical indicators (${initialCounts.technicalIndicators} records)?`
      );
      
      // Show summary of what will be deleted
      console.log('\n📋 Deletion Summary:');
      console.log('═'.repeat(40));
      console.log(`🎯 ${targetDescription.charAt(0).toUpperCase() + targetDescription.slice(1)}: ${targetCount.toLocaleString()} records`);
      if (includeMetrics) {
        console.log(`📊 Prediction metrics: ${initialCounts.predictionMetrics.toLocaleString()} records`);
      }
      if (includeIndicators) {
        console.log(`🔧 Technical indicators: ${initialCounts.technicalIndicators.toLocaleString()} records`);
      }
      console.log('═'.repeat(40));
      
      // Final confirmation
      const finalConfirm = await this.getConfirmation(
        '\n⚠️  This action cannot be undone. Are you sure you want to proceed?'
      );
      
      if (!finalConfirm) {
        console.log('\n✅ Operation cancelled by user.');
        return;
      }
      
      // Execute deletion with transaction
      console.log('\n🔄 Executing deletion...');
      const results = await this.executeWithTransaction(deletionChoice, includeMetrics, includeIndicators);
      
      // Show final results
      console.log('\n🎉 Deletion completed successfully!');
      console.log('═'.repeat(40));
      console.log(`🗑️  Predictions deleted: ${results.predictions.toLocaleString()}`);
      if (includeMetrics) {
        console.log(`📊 Metrics deleted: ${results.metrics.toLocaleString()}`);
      }
      if (includeIndicators) {
        console.log(`🔧 Indicators deleted: ${results.indicators.toLocaleString()}`);
      }
      console.log('═'.repeat(40));
      
      // Show updated statistics
      await this.showDatabaseStats();
      
    } catch (error) {
      console.error('\n❌ Error during reset operation:', error.message);
      process.exit(1);
    } finally {
      await this.cleanup();
    }
  }
}

// Execute the script if run directly
if (require.main === module) {
  const resetTool = new DatabaseResetTool();
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Operation interrupted by user.');
    await resetTool.cleanup();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('\n\n🛑 Operation terminated.');
    await resetTool.cleanup();
    process.exit(0);
  });
  
  // Run the tool
  resetTool.run().then(() => {
    console.log('\n✅ Reset tool completed successfully.');
    process.exit(0);
  }).catch((error) => {
    console.error('\n❌ Reset tool failed:', error.message);
    process.exit(1);
  });
}

module.exports = DatabaseResetTool;