output "id" {
  value       = join("", aws_elasticache_cluster.default.*.id)
  description = "Redis cluster ID"
}

output "security_group_id" {
  value       = join("", aws_security_group.default.*.id)
  description = "Security group ID"
}

output "port" {
  value       = var.port
  description = "Redis port"
}

output "endpoint" {
  value = aws_elasticache_cluster.default.cluster_address
}
