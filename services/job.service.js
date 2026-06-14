const { Job } = require('../models');
const { Op } = require('sequelize');

class JobService {
  static async createJob(type, payload) {
    const job = await Job.create({
      type,
      payload,
      status: 'queued',
    });

    return job;
  }

  static async getQueuedJobs(limit = 10) {
    const jobs = await Job.findAll({
      where: {
        [Op.or]: [
          {
            status: 'queued',
          },
          {
            status: 'failed',
            next_retry_at: {
              [Op.lte]: new Date(),
            },
          },
        ],
      },
      order: [['created_at', 'ASC']],
      limit,
    });

    return jobs;
  }

  static async updateJobStatus(jobId, status, errorMessage = null) {
    const job = await Job.findByPk(jobId);

    if (!job) {
      throw new Error('Job not found');
    }

    job.status = status;
    if (errorMessage) {
      job.error_message = errorMessage;
    }
    job.updated_at = new Date();

    await job.save();

    return job;
  }

  static async incrementJobAttempts(jobId, nextRetryAt = null) {
    const job = await Job.findByPk(jobId);

    if (!job) {
      throw new Error('Job not found');
    }

    job.attempts += 1;
    if (nextRetryAt) {
      job.next_retry_at = nextRetryAt;
    }
    job.updated_at = new Date();

    await job.save();

    return job;
  }

  static async getJob(jobId) {
    const job = await Job.findByPk(jobId);

    if (!job) {
      throw new Error('Job not found');
    }

    return job;
  }

  static async deleteJob(jobId) {
    const job = await Job.findByPk(jobId);

    if (!job) {
      throw new Error('Job not found');
    }

    await job.destroy();

    return { success: true };
  }

  // Retry a failed job
  static async retryJob(jobId, maxAttempts = 3, retryDelayMinutes = 5) {
    const job = await Job.findByPk(jobId);

    if (!job) {
      throw new Error('Job not found');
    }

    if (job.attempts >= maxAttempts) {
      throw new Error('Max retry attempts reached');
    }

    const nextRetryAt = new Date();
    nextRetryAt.setMinutes(nextRetryAt.getMinutes() + retryDelayMinutes);

    job.status = 'queued';
    job.attempts += 1;
    job.next_retry_at = nextRetryAt;
    job.updated_at = new Date();

    await job.save();

    return job;
  }
}

module.exports = JobService;