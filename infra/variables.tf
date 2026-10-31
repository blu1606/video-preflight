variable "region" {
  type    = string
  default = "ap-southeast-1"
}

variable "project_name" {
  type    = string
  default = "video-preflight"
}

variable "instance_type" {
  type    = string
  default = "m7i.xlarge"
}

variable "root_volume_gib" {
  type    = number
  default = 100
  validation {
    condition     = var.root_volume_gib >= 30
    error_message = "Use at least 30 GiB for images, video and caches."
  }
}

variable "ssh_public_key_path" {
  description = "Existing SSH PUBLIC key file. Never supply the private key to Terraform."
  type        = string
}

variable "ssh_allowed_cidrs" {
  description = "IPv4 CIDRs allowed to SSH. GitHub hosted runners need a reachable SSH endpoint; see deploy/README.md."
  type        = list(string)
  validation {
    condition     = length(var.ssh_allowed_cidrs) > 0 && alltrue([for cidr in var.ssh_allowed_cidrs : can(cidrnetmask(cidr))])
    error_message = "Supply at least one valid IPv4 CIDR."
  }
}
