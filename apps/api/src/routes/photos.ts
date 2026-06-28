// Photo upload/serve/list routes.
//
// Require auth via resolveOrgId (JWT w/ dev fallback). Multipart parsing is
// scoped to this plugin via @fastify/multipart so it doesn't affect other routes.

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import multipart from "@fastify/multipart";
import { resolveOrgId } from "./org.js";
import { savePhoto, getPhotoFile, listJobPhotos } from "../uploads.js";

interface PhotoParams {
  jobId: string;
}

interface PhotoIdParams {
  photoId: string;
}

export async function photoRoutes(app: FastifyInstance) {
  // Scoped multipart — only /api/photos/* can handle file uploads.
  await app.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50 MB default
    },
  });

  // POST /api/photos/upload/:jobId — multipart file upload
  app.post(
    "/upload/:jobId",
    async (req: FastifyRequest<{ Params: PhotoParams }>, reply: FastifyReply) => {
      const orgId = await resolveOrgId(req);
      const { jobId } = req.params;

      const file = await req.file();
      if (!file) {
        return reply.code(400).send({ error: "no file uploaded" });
      }

      const buffer = await file.toBuffer();
      const record = await savePhoto(
        orgId,
        jobId,
        buffer,
        file.mimetype,
        file.filename,
      );

      return reply.code(201).send(record);
    },
  );

  // GET /api/photos/:photoId/file — serve photo file
  app.get(
    "/:photoId/file",
    async (req: FastifyRequest<{ Params: PhotoIdParams }>, reply: FastifyReply) => {
      const orgId = await resolveOrgId(req);
      const { photoId } = req.params;

      const result = await getPhotoFile(photoId, orgId);
      if (!result) {
        return reply.code(404).send({ error: "photo not found" });
      }

      return reply.type(result.record.contentType).send(result.buffer);
    },
  );

  // GET /api/photos/job/:jobId — list all photos for a job
  // NOTE: this MUST be registered after `/:photoId/file` because Fastify
  // matches routes in order, and `job/:jobId` would be caught by `:photoId`.
  app.get(
    "/job/:jobId",
    async (req: FastifyRequest<{ Params: PhotoParams }>, reply: FastifyReply) => {
      const orgId = await resolveOrgId(req);
      const { jobId } = req.params;

      return listJobPhotos(jobId, orgId);
    },
  );
}
